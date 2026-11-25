using CivicBudget.Api.Dto;
using CivicBudget.Api.Hubs;
using CivicBudget.DAL.Entities;
using CivicBudget.DAL.Infrastructure;
using CivicBudget.DAL.Models;
using CivicBudget.DAL.Repositories;
using Microsoft.AspNetCore.SignalR;

namespace CivicBudget.Api.Services;

/// <summary>Кампанії: перегляд, параметри й ліміти категорій, етапи, визначення переможців, результати, статистика.</summary>
public class CampaignService
{
    public static readonly string[] Statuses = { "draft", "submission", "review", "voting", "counting", "implementation", "closed" };

    private readonly ICampaignRepository _campaigns;
    private readonly IProjectRepository _projects;
    private readonly IProcedureRepository _procedures;
    private readonly IStatisticsRepository _stats;
    private readonly IAuditRepository _audit;
    private readonly IHubContext<ResultsHub> _hub;

    public CampaignService(ICampaignRepository campaigns, IProjectRepository projects, IProcedureRepository procedures,
        IStatisticsRepository stats, IAuditRepository audit, IHubContext<ResultsHub> hub)
    {
        _campaigns = campaigns;
        _projects = projects;
        _procedures = procedures;
        _stats = stats;
        _audit = audit;
        _hub = hub;
    }

    public Task<CampaignModel?> GetCurrentAsync() => _campaigns.GetCurrentAsync();

    public Task<List<CampaignModel>> GetAllAsync() => _campaigns.GetAllAsync();

    public async Task<CampaignModel> GetAsync(short id) =>
        await _campaigns.GetModelAsync(id) ?? throw new KeyNotFoundException("Кампанію не знайдено.");

    public async Task<ResultsResponse> GetResultsAsync(short? campaignId)
    {
        var campaign = campaignId.HasValue ? await GetAsync(campaignId.Value)
            : await _campaigns.GetCurrentAsync() ?? throw new KeyNotFoundException("Кампанію не знайдено.");

        var rows = await _projects.GetResultsAsync(campaign.CampaignId);
        // до завершення голосування проміжні результати показуються лише якщо це дозволено параметром кампанії
        bool hidden = campaign.Status is "voting" or "counting" && !campaign.ShowInterimResults;
        if (hidden)
            rows = rows.Select(r => r with { TotalVotes = 0, OnlineVotes = 0, PaperVotes = 0, VoterCount = 0 }).ToList();
        return new ResultsResponse(campaign, hidden, rows);
    }

    public async Task<short> CreateAsync(CampaignEditDto dto, int adminId)
    {
        var campaign = new Campaign { Status = "draft", CreatedBy = adminId };
        Apply(campaign, dto);
        _campaigns.Add(campaign);
        await DbErrors.Run(_campaigns.SaveAsync);
        await _audit.WriteAsync(adminId, "campaign_create", "Campaign", campaign.CampaignId, campaign.Name);
        return campaign.CampaignId;
    }

    public async Task UpdateAsync(short id, CampaignEditDto dto, int adminId)
    {
        var campaign = await _campaigns.GetEntityAsync(id) ?? throw new KeyNotFoundException("Кампанію не знайдено.");
        Apply(campaign, dto);
        await DbErrors.Run(_campaigns.SaveAsync);
        await _audit.WriteAsync(adminId, "campaign_update", "Campaign", id, "параметри та ліміти категорій");
    }

    private static void Apply(Campaign c, CampaignEditDto dto)
    {
        // перевірки дат і сум дублюють CHECK-обмеження лише заради зрозумілого повідомлення
        if (!(dto.SubmissionStart <= dto.SubmissionEnd && dto.SubmissionEnd <= dto.ReviewEnd &&
              dto.ReviewEnd < dto.VotingStart && dto.VotingStart <= dto.VotingEnd && dto.VotingEnd <= dto.ResultsDate))
            throw new BusinessRuleException("Етапи мають іти послідовно: подання → розгляд → голосування → результати.");
        if (dto.MinProjectCost > dto.MaxProjectCost || dto.MaxProjectCost > dto.TotalBudget)
            throw new BusinessRuleException("Мінімальна вартість ≤ максимальна вартість ≤ загальний бюджет.");
        if (dto.MaxVotesPerProject > dto.VotesPerVoter)
            throw new BusinessRuleException("Голосів за один проєкт не може бути більше, ніж голосів у виборця.");

        c.CampaignYear = dto.CampaignYear;
        c.Name = dto.Name.Trim();
        c.TotalBudget = dto.TotalBudget;
        c.MinProjectCost = dto.MinProjectCost;
        c.MaxProjectCost = dto.MaxProjectCost;
        c.VotesPerVoter = dto.VotesPerVoter;
        c.MaxVotesPerProject = dto.MaxVotesPerProject;
        c.MaxProjectsPerAuthor = dto.MaxProjectsPerAuthor;
        c.MinVoterAge = dto.MinVoterAge;
        c.SubmissionStart = dto.SubmissionStart;
        c.SubmissionEnd = dto.SubmissionEnd;
        c.ReviewEnd = dto.ReviewEnd;
        c.VotingStart = dto.VotingStart;
        c.VotingEnd = dto.VotingEnd;
        c.ResultsDate = dto.ResultsDate;
        c.ShowInterimResults = dto.ShowInterimResults;

        // ліміти категорій: оновити наявні, додати нові, прибрати зняті
        foreach (var limit in dto.Categories)
        {
            var existing = c.CampaignCategories.FirstOrDefault(cc => cc.CategoryId == limit.CategoryId);
            if (existing != null) existing.BudgetLimit = limit.BudgetLimit;
            else c.CampaignCategories.Add(new CampaignCategory { CategoryId = limit.CategoryId, BudgetLimit = limit.BudgetLimit });
        }
        foreach (var removed in c.CampaignCategories.Where(cc => dto.Categories.All(l => l.CategoryId != cc.CategoryId)).ToList())
            c.CampaignCategories.Remove(removed);
    }

    /// <summary>Перемикання етапу кампанії.</summary>
    public async Task SetStatusAsync(short id, string status, int adminId)
    {
        if (!Statuses.Contains(status)) throw new BusinessRuleException("Невідомий етап кампанії.");
        var campaign = await _campaigns.GetEntityAsync(id) ?? throw new KeyNotFoundException("Кампанію не знайдено.");
        var old = campaign.Status;
        campaign.Status = status;
        await DbErrors.Run(_campaigns.SaveAsync);
        await _audit.WriteAsync(adminId, "campaign_status", "Campaign", id, $"було {old}, стало {status}");
    }

    /// <summary>
    /// «Визначити переможців»: usp_SelectWinners через ADO.NET (SqlDataReader),
    /// далі рейтинг доповнюється назвами проєктів і категорій.
    /// </summary>
    public async Task<List<WinnerRowDto>> SelectWinnersAsync(short id)
    {
        var rating = await _procedures.SelectWinnersAsync(id);
        var campaign = await GetAsync(id);
        var results = (await _projects.GetResultsAsync(id)).ToDictionary(r => r.ProjectId);

        await _hub.Clients.All.SendAsync("votesChanged", 0);

        return rating.Select(r =>
        {
            var cat = campaign.Categories.FirstOrDefault(c => c.CategoryId == r.CategoryId);
            results.TryGetValue(r.ProjectId, out var res);
            return new WinnerRowDto(r.CategoryId, cat?.CategoryName ?? "", cat?.BudgetLimit ?? 0, r.Place, r.ProjectId,
                res?.RegNumber, res?.Title ?? $"#{r.ProjectId}", r.Votes, r.Cost, r.IsWinner);
        }).ToList();
    }

    public async Task<StatisticsResponse> GetStatisticsAsync(short? campaignId)
    {
        var campaign = campaignId.HasValue ? await GetAsync(campaignId.Value)
            : await _campaigns.GetCurrentAsync() ?? throw new KeyNotFoundException("Кампанію не знайдено.");
        var id = campaign.CampaignId;
        return new StatisticsResponse(campaign,
            await _stats.GetSummaryAsync(id),
            await _stats.GetByCategoryAsync(id),
            await _stats.GetByDistrictAsync(id),
            await _stats.GetByStatusAsync(id),
            await _stats.GetBudgetUsageAsync(id));
    }
}
