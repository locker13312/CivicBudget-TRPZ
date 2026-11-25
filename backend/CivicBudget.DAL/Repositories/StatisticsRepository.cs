using CivicBudget.DAL.Models;
using Microsoft.EntityFrameworkCore;

namespace CivicBudget.DAL.Repositories;

/// <summary>
/// Зведена статистика. Звіти написано в синтаксисі запитів LINQ
/// (from … join … group … by … into … select), як у лекції про LINQ.
/// </summary>
public class StatisticsRepository : IStatisticsRepository
{
    private static readonly string[] PublicStatuses = { "published", "winner", "not_selected", "implementing", "completed" };

    private readonly CivicBudgetContext _db;
    public StatisticsRepository(CivicBudgetContext db) => _db = db;

    /// <summary>Статистика за категоріями: кількість проєктів, сумарна вартість, голоси, ліміт категорії.</summary>
    public async Task<List<CategoryStat>> GetByCategoryAsync(short campaignId)
    {
        // 1) join уявлення vw_ProjectResult (вартість і голоси вже пораховано по проєкту) з довідником категорій,
        //    групування за категорією
        var perCategory = await (
            from r in _db.VwProjectResults
            join c in _db.Categories on r.CategoryId equals c.CategoryId
            where r.CampaignId == campaignId
            group r by new { c.CategoryId, c.Name } into g
            select new
            {
                g.Key.CategoryId,
                g.Key.Name,
                ProjectCount = g.Count(),
                TotalCost = g.Sum(x => x.EstimatedCost),
                TotalVotes = g.Sum(x => x.TotalVotes)
            }).ToListAsync();

        // 2) ліміти категорій кампанії; left join (join … into … DefaultIfEmpty) — категорії без проєктів теж видно
        var limits = await (
            from cc in _db.CampaignCategories
            join c in _db.Categories on cc.CategoryId equals c.CategoryId
            where cc.CampaignId == campaignId
            orderby c.CategoryId
            select new { c.CategoryId, c.Name, cc.BudgetLimit }).ToListAsync();

        return (
            from l in limits
            join s in perCategory on l.CategoryId equals s.CategoryId into stats
            from s in stats.DefaultIfEmpty()
            orderby s == null ? 0 : s.TotalVotes descending, l.Name
            select new CategoryStat(l.Name, s?.ProjectCount ?? 0, s?.TotalCost ?? 0, s?.TotalVotes ?? 0, l.BudgetLimit))
            .ToList();
    }

    /// <summary>Статистика за районами.</summary>
    public Task<List<DistrictStat>> GetByDistrictAsync(short campaignId) =>
        (from r in _db.VwProjectResults
         join p in _db.Projects on r.ProjectId equals p.ProjectId
         join d in _db.Districts on p.DistrictId equals d.DistrictId
         where r.CampaignId == campaignId
         group r by d.Name into g
         select new { Name = g.Key, Count = g.Count(), Votes = g.Sum(x => x.TotalVotes) } into s
         orderby s.Votes descending, s.Name
         select new DistrictStat(s.Name, s.Count, s.Votes))
        .ToListAsync();

    /// <summary>Проєкти кампанії за статусами (усі статуси, включно з чернетками).</summary>
    public Task<List<StatusStat>> GetByStatusAsync(short campaignId) =>
        (from p in _db.Projects
         where p.CampaignId == campaignId
         group p by p.Status into g
         orderby g.Count() descending
         select new StatusStat(g.Key, g.Count()))
        .ToListAsync();

    public async Task<SummaryStat> GetSummaryAsync(short campaignId)
    {
        var votes = _db.Votes.Where(v => v.Project.CampaignId == campaignId);
        return new SummaryStat(
            await _db.UserAccounts.CountAsync(),
            await _db.UserAccounts.CountAsync(u => u.VerificationStatus == "verified"),
            await _db.Projects.CountAsync(p => p.CampaignId == campaignId),
            await _db.Projects.CountAsync(p => p.CampaignId == campaignId && PublicStatuses.Contains(p.Status)),
            await votes.SumAsync(v => (int?)v.VoteCount) ?? 0,
            await votes.Where(v => v.Channel == "online").SumAsync(v => (int?)v.VoteCount) ?? 0,
            await votes.Where(v => v.Channel == "paper").SumAsync(v => (int?)v.VoteCount) ?? 0,
            await votes.Select(v => v.VoterId).Distinct().CountAsync());
    }

    /// <summary>
    /// Освоєння бюджету: план/факт карток реалізації кампанії (уявлення vw_ImplementationProgress)
    /// і сумарна вартість проєктів-переможців — запит у синтаксисі LINQ з join.
    /// </summary>
    public async Task<BudgetUsageStat> GetBudgetUsageAsync(short campaignId)
    {
        var impl = await (
            from i in _db.VwImplementationProgresses
            join p in _db.Projects on i.ProjectId equals p.ProjectId
            where p.CampaignId == campaignId
            select new { i.Status, i.PlannedBudget, i.ActualCost }).ToListAsync();

        string[] winnerStatuses = { "winner", "implementing", "completed" };
        var winnersCost = await (
            from r in _db.VwProjectResults
            where r.CampaignId == campaignId && winnerStatuses.Contains(r.Status)
            select r.EstimatedCost).SumAsync();

        return new BudgetUsageStat(impl.Count, impl.Count(i => i.Status == "completed"),
            impl.Sum(i => i.PlannedBudget), impl.Sum(i => i.ActualCost), winnersCost);
    }
}
