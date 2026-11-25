using CivicBudget.DAL.Entities;
using CivicBudget.DAL.Models;
using Microsoft.EntityFrameworkCore;

namespace CivicBudget.DAL.Repositories;

/// <summary>Вкладення (фото, PDF) проєктів і звітів. У БД — метадані, файл — за StorageKey у папці сервера.</summary>
public class AttachmentRepository : IAttachmentRepository
{
    private readonly CivicBudgetContext _db;
    public AttachmentRepository(CivicBudgetContext db) => _db = db;

    public Task<AttachmentFile?> GetAsync(int attachmentId) =>
        _db.Attachments.AsNoTracking()
            .Where(a => a.AttachmentId == attachmentId)
            .Select(a => new AttachmentFile(a.AttachmentId, a.FileName, a.MimeType, a.StorageKey, a.SizeBytes,
                a.ProjectId, a.ReportId, a.UploadedBy,
                a.Project != null ? a.Project.Status : null,
                a.Project != null ? a.Project.AuthorId : null,
                a.Report != null ? a.Report.Status : null))
            .FirstOrDefaultAsync();

    public Task<int> CountForProjectAsync(int projectId) => _db.Attachments.CountAsync(a => a.ProjectId == projectId);

    public void Add(Attachment attachment) => _db.Attachments.Add(attachment);

    public Task RemoveAsync(int attachmentId) =>
        _db.Attachments.Where(a => a.AttachmentId == attachmentId).ExecuteDeleteAsync();

    public Task SaveAsync() => _db.SaveChangesAsync();
}

/// <summary>
/// Реалізація проєктів: картки (Implementation), етапи (ImplementationStage), звіти виконавців (Report).
/// План/факт і кількість виконаних етапів беруться з уявлення vw_ImplementationProgress.
/// </summary>
public class ImplementationRepository : IImplementationRepository
{
    private readonly CivicBudgetContext _db;
    public ImplementationRepository(CivicBudgetContext db) => _db = db;

    // «Хід реалізації»: join картки з уявленням прогресу, проєктом і підрядником (синтаксис запитів LINQ). Фільтри (кампанія, підрядник, картка) застосовуються до join, ще до проєкції в модель.
    private IQueryable<ImplementationListItem> ListQuery(short? campaignId = null, int? contractorId = null, int? implementationId = null) =>
        from i in _db.Implementations
        join v in _db.VwImplementationProgresses on i.ImplementationId equals v.ImplementationId
        join p in _db.Projects on i.ProjectId equals p.ProjectId
        join c in _db.Contractors on i.ContractorId equals c.ContractorId
        where (campaignId == null || p.CampaignId == campaignId)
              && (contractorId == null || i.ContractorId == contractorId)
              && (implementationId == null || i.ImplementationId == implementationId)
        orderby p.CampaignId descending, p.Title
        select new ImplementationListItem(
            i.ImplementationId, p.ProjectId, p.RegNumber, p.Title, p.CampaignCategory.Campaign.CampaignYear,
            p.CampaignCategory.Category.Name, p.District.Name, c.ContractorId, c.Name, i.Status,
            i.PlannedBudget, v.ActualCost, v.StagesTotal ?? 0, v.StagesDone,
            i.StartDate, i.PlannedEndDate, i.ActualEndDate,
            _db.Reports.Count(r => r.Stage.ImplementationId == i.ImplementationId && r.Status == "submitted"));

    public Task<List<ImplementationListItem>> GetListAsync(short? campaignId, int? contractorId) =>
        ListQuery(campaignId, contractorId).AsNoTracking().ToListAsync();

    public async Task<ImplementationDetails?> GetDetailsAsync(int implementationId, bool onlyAcceptedReports)
    {
        var summary = await ListQuery(implementationId: implementationId).AsNoTracking().FirstOrDefaultAsync();
        if (summary == null) return null;

        var contractor = await _db.Contractors.AsNoTracking().FirstAsync(c => c.ContractorId == summary.ContractorId);
        var stages = await _db.ImplementationStages.AsNoTracking()
            .Where(s => s.ImplementationId == implementationId)
            .Include(s => s.Reports).ThenInclude(r => r.Author)
            .Include(s => s.Reports).ThenInclude(r => r.ReviewedByNavigation)
            .Include(s => s.Reports).ThenInclude(r => r.Attachments)
            .OrderBy(s => s.StageNo)
            .AsSplitQuery()
            .ToListAsync();

        return new ImplementationDetails(summary, contractor.Phone, contractor.Email,
            stages.Select(s => new StageModel(s.StageId, s.StageNo, s.Name, s.PlannedEndDate, s.PlannedCost,
                s.ActualCost, s.Status, s.CompletedAt,
                s.Reports.Where(r => !onlyAcceptedReports || r.Status == "accepted")
                    .OrderByDescending(r => r.SubmittedAt)
                    .Select(ToModel).ToList())).ToList());
    }

    private static ReportModel ToModel(Report r) => new(
        r.ReportId, r.StageId, $"{r.Author.LastName} {r.Author.FirstName}", r.Body, r.Status, r.SubmittedAt,
        r.ReviewedByNavigation == null ? null : $"{r.ReviewedByNavigation.LastName} {r.ReviewedByNavigation.FirstName}",
        r.ReviewedAt, r.ReviewComment,
        r.Attachments.OrderBy(a => a.AttachmentId)
            .Select(a => new AttachmentModel(a.AttachmentId, a.FileName, a.MimeType, a.SizeBytes, a.UploadedAt)).ToList());

    public Task<Implementation?> GetEntityAsync(int implementationId) =>
        _db.Implementations.Include(i => i.ImplementationStages).Include(i => i.Project)
            .FirstOrDefaultAsync(i => i.ImplementationId == implementationId);

    public Task<ImplementationStage?> GetStageAsync(int stageId) =>
        _db.ImplementationStages.Include(s => s.Implementation)
            .FirstOrDefaultAsync(s => s.StageId == stageId);

    public Task<Report?> GetReportAsync(int reportId) =>
        _db.Reports.Include(r => r.Stage).ThenInclude(s => s.Implementation)
            .FirstOrDefaultAsync(r => r.ReportId == reportId);

    public async Task<List<PendingReport>> GetPendingReportsAsync()
    {
        var reports = await _db.Reports.AsNoTracking()
            .Where(r => r.Status == "submitted")
            .Include(r => r.Author)
            .Include(r => r.Attachments)
            .Include(r => r.Stage).ThenInclude(s => s.Implementation).ThenInclude(i => i.Project)
            .OrderBy(r => r.SubmittedAt)
            .AsSplitQuery()
            .ToListAsync();
        return reports.Select(r => new PendingReport(r.ReportId, r.Stage.ImplementationId, r.Stage.Implementation.Project.Title,
            r.Stage.Implementation.Project.RegNumber, r.Stage.StageNo, r.Stage.Name,
            $"{r.Author.LastName} {r.Author.FirstName}", r.Body, r.SubmittedAt,
            r.Attachments.Select(a => new AttachmentModel(a.AttachmentId, a.FileName, a.MimeType, a.SizeBytes, a.UploadedAt)).ToList()))
            .ToList();
    }

    public Task<List<LookupItem>> GetContractorsAsync() =>
        _db.Contractors.AsNoTracking().OrderBy(c => c.Name).Select(c => new LookupItem(c.ContractorId, c.Name)).ToListAsync();

    public Task<Project?> GetProjectAsync(int projectId) =>
        _db.Projects.Include(p => p.Implementation).FirstOrDefaultAsync(p => p.ProjectId == projectId);

    public void Add(Implementation implementation) => _db.Implementations.Add(implementation);

    public void AddReport(Report report) => _db.Reports.Add(report);

    public Task SaveAsync() => _db.SaveChangesAsync();
}
