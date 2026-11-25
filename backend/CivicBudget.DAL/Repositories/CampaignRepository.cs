using CivicBudget.DAL.Entities;
using CivicBudget.DAL.Models;
using Microsoft.EntityFrameworkCore;

namespace CivicBudget.DAL.Repositories;

public class CampaignRepository : ICampaignRepository
{
    private readonly CivicBudgetContext _db;

    public CampaignRepository(CivicBudgetContext db) => _db = db;

    // Проєкція в модель читання — останнім кроком; фільтри й сортування (Where/OrderBy) — до неї, над сутностями.
    private static IQueryable<CampaignModel> ToModels(IQueryable<Campaign> campaigns) =>
        campaigns.AsNoTracking().Select(c => new CampaignModel(
            c.CampaignId, c.CampaignYear, c.Name, c.TotalBudget, c.MinProjectCost, c.MaxProjectCost,
            c.VotesPerVoter, c.MaxVotesPerProject, c.MaxProjectsPerAuthor, c.MinVoterAge,
            c.SubmissionStart, c.SubmissionEnd, c.ReviewEnd, c.VotingStart, c.VotingEnd, c.ResultsDate,
            c.ShowInterimResults, c.Status,
            c.CampaignCategories.OrderBy(cc => cc.CategoryId)
                .Select(cc => new CampaignCategoryModel(cc.CategoryId, cc.Category.Name, cc.BudgetLimit)).ToList()));

    /// <summary>Поточна кампанія — найновіша, що не в чернетці й не закрита.</summary>
    public Task<CampaignModel?> GetCurrentAsync() =>
        ToModels(_db.Campaigns
                .Where(c => c.Status != "closed" && c.Status != "draft")
                .OrderByDescending(c => c.CampaignYear))
            .FirstOrDefaultAsync();

    public Task<CampaignModel?> GetModelAsync(short campaignId) =>
        ToModels(_db.Campaigns.Where(c => c.CampaignId == campaignId)).FirstOrDefaultAsync();

    public Task<List<CampaignModel>> GetAllAsync() =>
        ToModels(_db.Campaigns.OrderByDescending(c => c.CampaignYear)).ToListAsync();

    public Task<Campaign?> GetEntityAsync(short campaignId) =>
        _db.Campaigns.Include(c => c.CampaignCategories).FirstOrDefaultAsync(c => c.CampaignId == campaignId);

    public void Add(Campaign campaign) => _db.Campaigns.Add(campaign);

    public Task SaveAsync() => _db.SaveChangesAsync();
}
