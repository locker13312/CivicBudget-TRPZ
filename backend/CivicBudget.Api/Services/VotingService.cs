using CivicBudget.Api.Dto;
using CivicBudget.Api.Hubs;
using CivicBudget.DAL.Entities;
using CivicBudget.DAL.Infrastructure;
using CivicBudget.DAL.Models;
using CivicBudget.DAL.Repositories;
using Microsoft.AspNetCore.SignalR;

namespace CivicBudget.Api.Services;

/// <summary>
/// Голосування. Застосунок НЕ перевіряє вік, ліміти 5/2 і спосіб голосування сам —
/// це робить тригер TR_Vote_CheckRules, а тут помилки 50001–50005 перекладаються в зрозумілий текст.
/// </summary>
public class VotingService
{
    private readonly ICampaignRepository _campaigns;
    private readonly IProjectRepository _projects;
    private readonly IVoteRepository _votes;
    private readonly IHubContext<ResultsHub> _hub;
    private readonly IFunctionRepository _functions;

    public VotingService(ICampaignRepository campaigns, IProjectRepository projects, IVoteRepository votes,
        IHubContext<ResultsHub> hub, IFunctionRepository functions)
    {
        _functions = functions;
        _campaigns = campaigns;
        _projects = projects;
        _votes = votes;
        _hub = hub;
    }

    /// <summary>Бюлетень мешканця: опубліковані проєкти поточної кампанії, його голоси і залишок.</summary>
    public async Task<MyBallot> GetMyBallotAsync(int voterId)
    {
        var campaign = await _campaigns.GetCurrentAsync();
        if (campaign == null)
            return new MyBallot(null, false, 0, 0, 0, 0, null, Array.Empty<BallotProject>());

        var mine = await _votes.GetVoterVotesAsync(voterId, campaign.CampaignId);
        var projects = await _projects.SearchAsync(
            new ProjectFilter { CampaignId = campaign.CampaignId, Status = "published", Sort = "title", PageSize = 100 },
            ProjectService.PublicStatuses);

        int used = mine.Sum(v => v.VoteCount);
        // залишок рахує функція БД — так само, як його перевіряє тригер TR_Vote_CheckRules
        int remaining = await _functions.GetRemainingVotesAsync(voterId, campaign.CampaignId);
        bool hidden = CampaignService.VotesHidden(campaign);
        var list = projects.Items.Select(p => new BallotProject(
                p.ProjectId, p.RegNumber, p.Title, p.CategoryName, p.DistrictName, p.Cost, hidden ? 0 : p.TotalVotes,
                mine.Where(v => v.ProjectId == p.ProjectId).Sum(v => v.VoteCount)))
            .ToList();

        return new MyBallot(campaign, campaign.Status == "voting", campaign.VotesPerVoter, campaign.MaxVotesPerProject,
            used, remaining, mine.FirstOrDefault()?.Channel, list, hidden);
    }

    /// <summary>Віддати ще один голос за проєкт: новий рядок Vote або VoteCount + 1.</summary>
    public async Task<MyBallot> CastAsync(int voterId, int projectId)
    {
        var vote = await _votes.GetAsync(voterId, projectId);
        if (vote == null)
            _votes.Add(new Vote { VoterId = voterId, ProjectId = projectId, VoteCount = 1, Channel = "online", CastAt = DateTime.Now });
        else if (vote.Channel != "online")
        {
            // Паперовий рядок не можна «доповнювати» онлайн: UPDATE VoteCount не змінює Channel,
            // тож тригер 50005 цього не побачить. Повідомлення — те саме, що для 50005.
            throw new BusinessRuleException(
                "Ви вже голосували в цій кампанії іншим способом (онлайн або паперовим бюлетенем). Змішувати способи не можна.",
                50005);
        }
        else
        {
            vote.VoteCount++;          // третій голос за проєкт → тригер кине 50003
            vote.CastAt = DateTime.Now;
        }

        await DbErrors.Run(_votes.SaveAsync);
        await NotifyAsync(projectId);
        return await GetMyBallotAsync(voterId);
    }

    /// <summary>Паперовий бюлетень від оператора: усі голоси однією транзакцією (SaveChanges).</summary>
    public async Task<int> AddPaperBallotAsync(int operatorId, PaperBallotDto dto)
    {
        var items = dto.Items.Where(i => i.Count > 0).GroupBy(i => i.ProjectId)
            .Select(g => new { ProjectId = g.Key, Count = g.Sum(i => i.Count) }).ToList();
        if (items.Count == 0) throw new BusinessRuleException("Позначте хоча б один проєкт.");

        var now = DateTime.Now;
        _votes.AddRange(items.Select(i => new Vote
        {
            VoterId = dto.VoterId,
            ProjectId = i.ProjectId,
            VoteCount = (byte)Math.Min(i.Count, 255),
            Channel = "paper",
            StationId = dto.StationId,
            OperatorId = operatorId,
            CastAt = now
        }));

        await DbErrors.Run(_votes.SaveAsync);
        foreach (var i in items) await NotifyAsync(i.ProjectId);
        return items.Sum(i => i.Count);
    }

    /// <summary>Виборці для оператора з поточним станом голосування (fn_RemainingVotes).</summary>
    public async Task<List<VoterStatus>> FindVotersAsync(string name, DateOnly? birthDate)
    {
        var campaign = await _campaigns.GetCurrentAsync()
                       ?? throw new BusinessRuleException("Зараз немає оголошеної кампанії.");
        return await _functions.FindVotersAsync(name, birthDate, campaign.CampaignId);
    }

    // SignalR: усі відкриті сторінки результатів і карток оновлюють лічильники.
    private Task NotifyAsync(int projectId) => _hub.Clients.All.SendAsync("votesChanged", projectId);
}
