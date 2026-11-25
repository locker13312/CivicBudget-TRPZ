using CivicBudget.DAL.Entities;
using CivicBudget.DAL.Models;
using Microsoft.EntityFrameworkCore;

namespace CivicBudget.DAL.Repositories;

/// <summary>
/// Репозиторій проєктів (EF Core + LINQ). Усі запити до таблиці Project — тут, а не в контролерах.
/// </summary>
public class ProjectRepository : IProjectRepository
{
    private readonly CivicBudgetContext _db;

    public ProjectRepository(CivicBudgetContext db) => _db = db;

    /// <summary>Проміжна проєкція: проєкт + вартість (з уявлення vw_ProjectCost) + сума голосів.</summary>
    private class Row
    {
        public Project P { get; set; } = null!;
        public decimal Cost { get; set; }
        public int Votes { get; set; }
    }

    // Лямбда-вирази: до кожного проєкту «підтягуємо» вартість з уявлення та суму голосів.
    private IQueryable<Row> WithCostAndVotes(IQueryable<Project> source) =>
        source.Select(p => new Row
        {
            P = p,
            Cost = _db.VwProjectCosts.Where(c => c.ProjectId == p.ProjectId).Select(c => c.EstimatedCost).FirstOrDefault(),
            Votes = p.Votes.Sum(v => (int?)v.VoteCount) ?? 0
        });

    private static IQueryable<ProjectListItem> ToListItems(IQueryable<Row> rows) =>
        rows.Select(x => new ProjectListItem(
            x.P.ProjectId, x.P.CampaignId, x.P.RegNumber, x.P.Title, x.P.Summary, x.P.Status,
            x.P.CategoryId, x.P.CampaignCategory.Category.Name,
            x.P.DistrictId, x.P.District.Name,
            x.Cost, x.Votes,
            x.P.Author.LastName + " " + x.P.Author.FirstName,
            x.P.UpdatedAt,
            x.P.Reviews.OrderByDescending(r => r.CreatedAt).ThenByDescending(r => r.ReviewId).Select(r => r.Decision).FirstOrDefault(),
            x.P.Reviews.OrderByDescending(r => r.CreatedAt).ThenByDescending(r => r.ReviewId).Select(r => r.Comment).FirstOrDefault(),
            x.P.ModeratorId,
            x.P.Moderator != null ? x.P.Moderator.LastName + " " + x.P.Moderator.FirstName : null,
            x.P.DuplicateOfId,
            // перше фото проєкту — для обкладинки картки в каталозі
            x.P.Attachments.Where(a => a.MimeType.StartsWith("image/")).OrderBy(a => a.AttachmentId)
                .Select(a => (int?)a.AttachmentId).FirstOrDefault()));

    /// <summary>
    /// Каталог: фільтри методами LINQ з лямбдами (Where, OrderBy, ThenBy),
    /// посторінковий перегляд Skip/Take (EF перетворює їх на OFFSET … FETCH NEXT).
    /// </summary>
    public async Task<PagedResult<ProjectListItem>> SearchAsync(ProjectFilter f, IReadOnlyCollection<string> allowedStatuses)
    {
        var rows = Filtered(f, allowedStatuses);

        rows = f.Sort switch
        {
            "cost" => rows.OrderBy(x => x.Cost).ThenBy(x => x.P.Title),
            "cost_desc" => rows.OrderByDescending(x => x.Cost).ThenBy(x => x.P.Title),
            "new" => rows.OrderByDescending(x => x.P.PublishedAt).ThenByDescending(x => x.P.ProjectId),
            "title" => rows.OrderBy(x => x.P.Title),
            _ => rows.OrderByDescending(x => x.Votes).ThenBy(x => x.P.Title),
        };

        var total = await rows.CountAsync();
        var page = Math.Max(1, f.Page);
        var size = Math.Clamp(f.PageSize, 1, 100);

        var items = await ToListItems(rows.Skip((page - 1) * size).Take(size)).ToListAsync();
        return new PagedResult<ProjectListItem>(items, total, page, size);
    }

    public async Task<ProjectDetails?> GetDetailsAsync(int projectId)
    {
        var p = await _db.Projects.AsNoTracking()
            .Include(x => x.CampaignCategory).ThenInclude(cc => cc.Campaign)
            .Include(x => x.CampaignCategory).ThenInclude(cc => cc.Category)
            .Include(x => x.District)
            .Include(x => x.Author)
            .Include(x => x.BudgetItems)
            .Include(x => x.Reviews).ThenInclude(r => r.Reviewer)
            .Include(x => x.Moderator)
            .Include(x => x.DuplicateOf)
            .Include(x => x.Implementation)
            .Include(x => x.Attachments)
            .AsSplitQuery()
            .FirstOrDefaultAsync(x => x.ProjectId == projectId);
        if (p == null) return null;

        var votes = await _db.Votes.Where(v => v.ProjectId == projectId)
            .GroupBy(v => v.Channel)
            .Select(g => new { Channel = g.Key, Sum = g.Sum(v => (int)v.VoteCount), Voters = g.Count() })
            .ToListAsync();
        int online = votes.Where(v => v.Channel == "online").Sum(v => v.Sum);
        int paper = votes.Where(v => v.Channel == "paper").Sum(v => v.Sum);

        return new ProjectDetails(
            p.ProjectId, p.CampaignId, p.CampaignCategory.Campaign.Name, p.CampaignCategory.Campaign.Status,
            p.RegNumber, p.Title, p.Summary, p.Description, p.Address, p.Status,
            p.CategoryId, p.CampaignCategory.Category.Name, p.DistrictId, p.District.Name,
            p.AuthorId, $"{p.Author.LastName} {p.Author.FirstName}", p.CreatedAt, p.SubmittedAt, p.PublishedAt,
            p.BudgetItems.Sum(b => b.Amount ?? 0), online + paper, online, paper, votes.Sum(v => v.Voters),
            p.BudgetItems.OrderBy(b => b.BudgetItemId)
                .Select(b => new BudgetItemModel(b.BudgetItemId, b.Name, b.Unit, b.Quantity, b.UnitPrice, b.Amount ?? 0)).ToList(),
            p.Reviews.OrderByDescending(r => r.CreatedAt).ThenByDescending(r => r.ReviewId)
                .Select(r => new ReviewModel(r.ReviewId, r.ReviewType, r.Decision, r.Comment,
                    $"{r.Reviewer.LastName} {r.Reviewer.FirstName}", r.CreatedAt)).ToList(),
            // geography зберігає точку як (X = довгота, Y = широта)
            p.Location?.Coordinate.Y, p.Location?.Coordinate.X,
            p.ModeratorId, p.Moderator == null ? null : $"{p.Moderator.LastName} {p.Moderator.FirstName}",
            p.DuplicateOfId, p.DuplicateOf?.RegNumber,
            p.Implementation?.ImplementationId,
            p.Attachments.OrderBy(a => a.AttachmentId)
                .Select(a => new AttachmentModel(a.AttachmentId, a.FileName, a.MimeType, a.SizeBytes, a.UploadedAt)).ToList());
    }

    /// <summary>Фільтри каталогу (лямбди) — спільні для списку і карти.</summary>
    private IQueryable<Row> Filtered(ProjectFilter f, IReadOnlyCollection<string> allowedStatuses)
    {
        IQueryable<Project> projects = _db.Projects.AsNoTracking().Where(p => allowedStatuses.Contains(p.Status));
        if (f.CampaignId.HasValue) projects = projects.Where(p => p.CampaignId == f.CampaignId);
        if (f.CategoryId.HasValue) projects = projects.Where(p => p.CategoryId == f.CategoryId);
        if (f.DistrictId.HasValue) projects = projects.Where(p => p.DistrictId == f.DistrictId);
        if (!string.IsNullOrWhiteSpace(f.Status)) projects = projects.Where(p => p.Status == f.Status);
        if (!string.IsNullOrWhiteSpace(f.Search))
        {
            var s = f.Search.Trim();
            projects = projects.Where(p => p.Title.Contains(s)
                || (p.Summary != null && p.Summary.Contains(s))
                || (p.RegNumber != null && p.RegNumber.Contains(s)));
        }
        var rows = WithCostAndVotes(projects);
        if (f.MinCost.HasValue) rows = rows.Where(x => x.Cost >= f.MinCost);
        if (f.MaxCost.HasValue) rows = rows.Where(x => x.Cost <= f.MaxCost);
        return rows;
    }

    public async Task<List<MapPoint>> GetMapPointsAsync(ProjectFilter f, IReadOnlyCollection<string> allowedStatuses)
    {
        var rows = await Filtered(f, allowedStatuses)
            .Where(x => x.P.Location != null)
            .Select(x => new { x.P.ProjectId, x.P.RegNumber, x.P.Title, x.P.Status, Category = x.P.CampaignCategory.Category.Name,
                               x.P.Location, x.Cost, x.Votes })
            .ToListAsync();
        return rows.Select(r => new MapPoint(r.ProjectId, r.RegNumber, r.Title, r.Status, r.Category,
            r.Location!.Coordinate.Y, r.Location.Coordinate.X, r.Cost, r.Votes)).ToList();
    }

    /// <summary>
    /// Схожі проєкти тієї ж кампанії (кандидати в дублікати): скільки слів запиту
    /// трапляється в назві, короткому чи повному описі. Чернетки й відхилені не враховуються.
    /// </summary>
    public async Task<List<SimilarProject>> FindSimilarAsync(short campaignId, int? excludeProjectId, IReadOnlyCollection<string> words)
    {
        if (words.Count == 0) return new();
        var candidates = await _db.Projects.AsNoTracking()
            .Where(p => p.CampaignId == campaignId && p.ProjectId != excludeProjectId
                        && p.Status != "draft" && p.Status != "rejected")
            .Select(p => new { p.ProjectId, p.RegNumber, p.Title, p.Status, Text = p.Title + " " + (p.Summary ?? "") + " " + (p.Description ?? "") })
            .ToListAsync();

        return candidates
            .Select(c => new { c, Text = c.Text.ToLowerInvariant() })
            .Select(x => new SimilarProject(x.c.ProjectId, x.c.RegNumber, x.c.Title, x.c.Status,
                words.Count(w => x.Text.Contains(w))))
            .Where(s => s.CommonWords >= 2)
            .OrderByDescending(s => s.CommonWords).ThenBy(s => s.Title)
            .Take(5)
            .ToList();
    }

    public Task<Project?> GetEntityAsync(int projectId) =>
        _db.Projects.Include(p => p.BudgetItems).FirstOrDefaultAsync(p => p.ProjectId == projectId);

    public Task<List<ProjectListItem>> GetByAuthorAsync(int authorId) =>
        ToListItems(WithCostAndVotes(_db.Projects.AsNoTracking().Where(p => p.AuthorId == authorId))
                .OrderByDescending(x => x.P.CampaignId).ThenByDescending(x => x.P.UpdatedAt))
            .ToListAsync();

    public Task<List<ProjectListItem>> GetByStatusesAsync(IReadOnlyCollection<string> statuses) =>
        ToListItems(WithCostAndVotes(_db.Projects.AsNoTracking().Where(p => statuses.Contains(p.Status)))
                .OrderBy(x => x.P.SubmittedAt).ThenBy(x => x.P.ProjectId))
            .ToListAsync();

    /// <summary>
    /// Результати голосування — LINQ у синтаксисі запитів (from … join … orderby … select)
    /// над уявленням vw_ProjectResult.
    /// </summary>
    public Task<List<ResultRow>> GetResultsAsync(short campaignId)
    {
        var query =
            from r in _db.VwProjectResults
            join p in _db.Projects on r.ProjectId equals p.ProjectId
            join c in _db.Categories on r.CategoryId equals c.CategoryId
            join d in _db.Districts on p.DistrictId equals d.DistrictId
            where r.CampaignId == campaignId
            orderby c.Name, r.TotalVotes descending, r.VoterCount descending
            select new ResultRow(r.ProjectId, r.RegNumber, r.Title, r.Status, r.CategoryId, c.Name, d.Name,
                r.EstimatedCost, r.TotalVotes, r.OnlineVotes, r.PaperVotes, r.VoterCount ?? 0);
        return query.AsNoTracking().ToListAsync();
    }

    public Task<int> CountAuthorProjectsAsync(int authorId, short campaignId) =>
        _db.Projects.CountAsync(p => p.AuthorId == authorId && p.CampaignId == campaignId);

    public void Add(Project project) => _db.Projects.Add(project);

    public void AddReview(Review review) => _db.Reviews.Add(review);

    public void RemoveBudgetItems(IEnumerable<BudgetItem> items) => _db.BudgetItems.RemoveRange(items);

    public Task SaveAsync() => _db.SaveChangesAsync();
}
