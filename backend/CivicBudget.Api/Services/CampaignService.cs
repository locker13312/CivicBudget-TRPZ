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
    private readonly IFunctionRepository _functions;

    /// <summary>Правило рівності голосів — те саме ORDER BY, що й у usp_SelectWinners.</summary>
    public const string TieRule =
        "За однакової кількості голосів вище стоїть проєкт, за який проголосувало більше виборців; далі — раніше зареєстрований.";

    public CampaignService(ICampaignRepository campaigns, IProjectRepository projects, IProcedureRepository procedures,
        IStatisticsRepository stats, IAuditRepository audit, IHubContext<ResultsHub> hub, IFunctionRepository functions)
    {
        _functions = functions;
        _campaigns = campaigns;
        _projects = projects;
        _procedures = procedures;
        _stats = stats;
        _audit = audit;
        _hub = hub;
    }

    public Task<CampaignModel?> GetCurrentAsync() => _campaigns.GetCurrentAsync();

    public Task<List<CampaignModel>> GetAllAsync() => _campaigns.GetAllAsync();

    // Без явного вибору — поточна кампанія; якщо всі в підготовці чи закриті — найновіша (архів результатів).
    private async Task<CampaignModel> ResolveAsync(short? campaignId) =>
        campaignId.HasValue
            ? await GetAsync(campaignId.Value)
            : await _campaigns.GetCurrentAsync()
              ?? (await _campaigns.GetAllAsync()).FirstOrDefault()
              ?? throw new KeyNotFoundException("Кампанію не знайдено.");

    public async Task<CampaignModel> GetAsync(short id) =>
        await _campaigns.GetModelAsync(id) ?? throw new KeyNotFoundException("Кампанію не знайдено.");

    public async Task<ResultsResponse> GetResultsAsync(short? campaignId)
    {
        var campaign = await ResolveAsync(campaignId);

        var rows = await _projects.GetResultsAsync(campaign.CampaignId);
        // до завершення голосування проміжні результати показуються лише якщо це дозволено параметром кампанії
        bool hidden = VotesHidden(campaign);
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

    /// <summary>Проміжні результати приховано: голосування чи підрахунок триває, а кампанія їх не показує.</summary>
    public static bool VotesHidden(CampaignModel c) => c.Status is "voting" or "counting" && !c.ShowInterimResults;

    private static string D(DateOnly d) => d.ToString("dd.MM.yyyy");

    /// <summary>
    /// Чи можна перемкнути етап і що станеться. Етапи йдуть лише по черзі; до підрахунку голосів можна
    /// повернутися на один крок назад, після — ні (голоси підраховано, хід кампанії змінювати не можна).
    /// «Реалізація» настає лише через «Визначити переможців».
    /// </summary>
    public async Task<StageTransitionCheck> CheckTransitionAsync(short id, string to)
    {
        var c = await GetAsync(id);
        int from = Array.IndexOf(Statuses, c.Status), target = Array.IndexOf(Statuses, to);
        if (target < 0) throw new BusinessRuleException("Невідомий етап кампанії.");

        var consequences = new List<string>();
        var warnings = new List<string>();
        string? blocker = null;
        var today = DateOnly.FromDateTime(DateTime.Today);
        var byStatus = (await _stats.GetByStatusAsync(id)).ToDictionary(x => x.Status, x => x.Count);
        int N(params string[] st) => st.Sum(x => byStatus.GetValueOrDefault(x));

        if (target == from) blocker = "Кампанія вже на цьому етапі.";
        else if (target < from)
        {
            if (from >= Array.IndexOf(Statuses, "counting"))
                blocker = "Після початку підрахунку голосів повернутися на попередній етап не можна.";
            else if (target != from - 1)
                blocker = "Повернутися можна лише на один етап назад.";
            else
                consequences.Add("Кампанія повернеться на попередній етап; ухвалені рішення щодо проєктів не зміняться.");
        }
        else if (target != from + 1)
            blocker = "Етапи перемикаються лише по черзі, без пропусків.";
        else switch (to)
        {
            case "submission":
                consequences.Add($"Мешканці зможуть подавати проєкти до {D(c.SubmissionEnd)}.");
                if (c.Categories.Count == 0) warnings.Add("Не задано жодного ліміту категорій — подати проєкт буде нікуди.");
                break;
            case "review":
                consequences.Add("Прийом нових проєктів закриється, модератори й експерти розглядають подані.");
                if (N("draft") > 0) warnings.Add($"Неподаних чернеток: {N("draft")}. Подати їх після цього буде неможливо.");
                if (today <= c.SubmissionEnd) warnings.Add($"За параметрами кампанії подання триває до {D(c.SubmissionEnd)}.");
                break;
            case "voting":
                consequences.Add($"Опубліковані проєкти ({N("published")}) стануть доступні для голосування.");
                if (N("submitted", "moderation", "expertise", "revision") > 0)
                    warnings.Add($"Ще не розглянуто проєктів: {N("submitted", "moderation", "expertise", "revision")}. До голосування вони не потраплять.");
                if (today < c.VotingStart || today > c.VotingEnd)
                    warnings.Add($"Онлайн-голоси приймаються лише в дати голосування ({D(c.VotingStart)} — {D(c.VotingEnd)}), поза ними база даних їх відхилить.");
                break;
            case "counting":
                consequences.Add("Онлайн-голосування закриється. Оператори ще можуть вносити паперові бюлетені.");
                consequences.Add("Повернутися до голосування після цього не можна.");
                if (today <= c.VotingEnd) warnings.Add($"За параметрами кампанії голосування триває до {D(c.VotingEnd)}.");
                break;
            case "implementation":
                blocker = "Етап «Реалізація» настає після кнопки «Визначити переможців»: вона підраховує голоси й відбирає проєкти.";
                break;
            case "closed":
                consequences.Add("Кампанія потрапить в архів; результати й хід реалізації лишаться доступними.");
                var usage = await _stats.GetBudgetUsageAsync(id);
                if (usage.Implementations > usage.Completed)
                    warnings.Add($"Незавершених реалізацій: {usage.Implementations - usage.Completed}.");
                if (N("winner") > 0) warnings.Add($"Переможців без картки реалізації: {N("winner")}.");
                break;
        }
        return new StageTransitionCheck(c.Status, to, blocker == null, blocker, consequences, warnings);
    }

    /// <summary>Перемикання етапу кампанії — лише якщо CheckTransitionAsync його дозволяє.</summary>
    public async Task SetStatusAsync(short id, string status, int adminId)
    {
        var check = await CheckTransitionAsync(id, status);
        if (!check.Allowed) throw new BusinessRuleException(check.Blocker!);

        var campaign = await _campaigns.GetEntityAsync(id) ?? throw new KeyNotFoundException("Кампанію не знайдено.");
        var old = campaign.Status;
        campaign.Status = status;
        await DbErrors.Run(_campaigns.SaveAsync);
        await _audit.WriteAsync(adminId, "campaign_status", "Campaign", id, $"було {old}, стало {status}");
    }

    /// <summary>
    /// «Визначити переможців»: usp_SelectWinners через ADO.NET (SqlDataReader).
    /// Після процедури повертається рейтинг з причинами й залишком бюджету категорій.
    /// </summary>
    public async Task<RatingResponse> SelectWinnersAsync(short id)
    {
        await _procedures.SelectWinnersAsync(id);
        await _hub.Clients.All.SendAsync("votesChanged", 0);
        return await GetRatingAsync(id);
    }

    /// <summary>
    /// Рейтинг за категоріями. Порядок і відбір повторюють usp_SelectWinners: голоси ↓, виборці ↓, номер ↑;
    /// проєкт проходить, якщо має голоси і вміщується в залишок ліміту категорії.
    /// До визначення переможців — попередній розрахунок, після — фактичні статуси з БД.
    /// </summary>
    public async Task<RatingResponse> GetRatingAsync(short id)
    {
        var campaign = await GetAsync(id);
        if (Array.IndexOf(Statuses, campaign.Status) < Array.IndexOf(Statuses, "counting"))
            throw new BusinessRuleException("Рейтинг формується після завершення голосування.");

        bool final = campaign.Status is "implementation" or "closed";
        var results = await _projects.GetResultsAsync(id);
        var rows = new List<WinnerRowDto>();

        foreach (var cat in campaign.Categories.OrderBy(c => c.CategoryName))
        {
            decimal left = cat.BudgetLimit;
            int place = 0;
            foreach (var r in results.Where(r => r.CategoryId == cat.CategoryId)
                         .OrderByDescending(r => r.TotalVotes).ThenByDescending(r => r.VoterCount).ThenBy(r => r.ProjectId))
            {
                place++;
                decimal before = left;
                bool fits = r.TotalVotes > 0 && r.Cost <= left;
                if (fits) left -= r.Cost;
                bool isWinner = final ? r.Status is "winner" or "implementing" or "completed" : fits;
                string reason = r.TotalVotes == 0
                    ? "Немає жодного голосу"
                    : fits ? "Вміщується в залишок ліміту"
                    : "Не вміщується в залишок ліміту";
                rows.Add(new WinnerRowDto(cat.CategoryId, cat.CategoryName, cat.BudgetLimit, place, r.ProjectId,
                    r.RegNumber, r.Title, r.TotalVotes, r.VoterCount, r.Cost, isWinner, before, reason));
            }
        }
        return new RatingResponse(campaign, final, TieRule, await _functions.GetCategoryBalanceAsync(id), rows);
    }

    public async Task<StatisticsResponse> GetStatisticsAsync(short? campaignId)
    {
        var campaign = await ResolveAsync(campaignId);
        var id = campaign.CampaignId;
        return new StatisticsResponse(campaign,
            await _stats.GetSummaryAsync(id),
            await _stats.GetByCategoryAsync(id),
            await _stats.GetByDistrictAsync(id),
            await _stats.GetByStatusAsync(id),
            await _stats.GetBudgetUsageAsync(id));
    }
}
