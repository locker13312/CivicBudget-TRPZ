using CivicBudget.Api.Dto;
using CivicBudget.Api.Infrastructure;
using CivicBudget.DAL.Entities;
using CivicBudget.DAL.Infrastructure;
using CivicBudget.DAL.Models;
using CivicBudget.DAL.Repositories;

namespace CivicBudget.Api.Services;

/// <summary>
/// Реалізація проєктів-переможців: картка реалізації з етапами (адміністратор),
/// кабінет виконавця (статус етапу, звіт із фото), прийняття звітів (адміністратор),
/// публічна сторінка «Хід реалізації» (план/факт з vw_ImplementationProgress).
/// </summary>
public class ImplementationService
{
    private static readonly string[] StageStatuses = { "planned", "in_progress", "done" };
    private static readonly string[] ImplementationStatuses = { "planned", "in_progress", "suspended", "completed" };

    private readonly IImplementationRepository _impl;
    private readonly IAttachmentRepository _attachments;
    private readonly IUserRepository _users;
    private readonly IAuditRepository _audit;
    private readonly FileStorage _files;

    public ImplementationService(IImplementationRepository impl, IAttachmentRepository attachments, IUserRepository users,
        IAuditRepository audit, FileStorage files)
    {
        _impl = impl;
        _attachments = attachments;
        _users = users;
        _audit = audit;
        _files = files;
    }

    // ---------- публічна частина ----------

    public Task<List<ImplementationListItem>> GetPublicListAsync(short? campaignId) => _impl.GetListAsync(campaignId, null);

    /// <summary>Публічно видно лише прийняті адміністратором звіти.</summary>
    public async Task<ImplementationDetails> GetPublicDetailsAsync(int id) =>
        await _impl.GetDetailsAsync(id, onlyAcceptedReports: true) ?? throw new KeyNotFoundException("Картку реалізації не знайдено.");

    // ---------- виконавець ----------

    private async Task<int> ContractorOfAsync(int executorId)
    {
        var user = await _users.GetByIdAsync(executorId) ?? throw new UnauthorizedAccessException();
        return user.ContractorId ?? throw new BusinessRuleException("Обліковий запис виконавця не прив'язано до підрядника.");
    }

    public async Task<List<ImplementationListItem>> GetExecutorListAsync(int executorId) =>
        await _impl.GetListAsync(null, await ContractorOfAsync(executorId));

    public async Task<ImplementationDetails> GetExecutorDetailsAsync(int id, int executorId)
    {
        var details = await _impl.GetDetailsAsync(id, onlyAcceptedReports: false) ?? throw new KeyNotFoundException("Картку не знайдено.");
        if (details.Summary.ContractorId != await ContractorOfAsync(executorId))
            throw new UnauthorizedAccessException("Ця картка реалізації не вашого підрядника.");
        return details;
    }

    private async Task<ImplementationStage> OwnStageAsync(int stageId, int executorId)
    {
        var stage = await _impl.GetStageAsync(stageId) ?? throw new KeyNotFoundException("Етап не знайдено.");
        if (stage.Implementation.ContractorId != await ContractorOfAsync(executorId))
            throw new UnauthorizedAccessException("Цей етап не вашого підрядника.");
        if (stage.Implementation.Status == "completed")
            throw new BusinessRuleException("Реалізацію завершено — зміни не приймаються.");
        return stage;
    }

    /// <summary>Виконавець змінює статус етапу; «виконано» — лише з фактичною вартістю (CK_ImplementationStage_Done).</summary>
    public async Task UpdateStageAsync(int stageId, int executorId, StageUpdateDto dto)
    {
        if (!StageStatuses.Contains(dto.Status)) throw new BusinessRuleException("Невідомий статус етапу.");
        var stage = await OwnStageAsync(stageId, executorId);
        if (dto.Status == "done" && dto.ActualCost == null)
            throw new BusinessRuleException("Щоб позначити етап виконаним, вкажіть фактичні витрати.");

        stage.Status = dto.Status;
        stage.ActualCost = dto.ActualCost ?? stage.ActualCost;
        stage.CompletedAt = dto.Status == "done" ? DateOnly.FromDateTime(DateTime.Today) : null;
        if (dto.Status != "planned" && stage.Implementation.Status == "planned")
            stage.Implementation.Status = "in_progress";
        await DbErrors.Run(_impl.SaveAsync);
        await _audit.WriteAsync(executorId, "stage_update", "ImplementationStage", stageId, $"статус {dto.Status}");
    }

    /// <summary>Звіт виконавця про етап з фото чи PDF (Report + Attachment). Чекає на прийняття адміністратором.</summary>
    public async Task<int> AddReportAsync(int stageId, int executorId, string body, IReadOnlyList<IFormFile> files)
    {
        if (string.IsNullOrWhiteSpace(body)) throw new BusinessRuleException("Опишіть, що виконано на етапі.");
        if (files.Count > 10) throw new BusinessRuleException("До звіту можна додати не більше 10 файлів.");
        foreach (var f in files) FileStorage.Validate(f);
        var stage = await OwnStageAsync(stageId, executorId);

        var report = new Report
        {
            StageId = stage.StageId,
            AuthorId = executorId,
            Body = body.Trim(),
            Status = "submitted",
            SubmittedAt = DateTime.Now
        };
        _impl.AddReport(report);
        await DbErrors.Run(_impl.SaveAsync);

        foreach (var f in files)
        {
            var key = await _files.SaveAsync(f, $"reports/{report.ReportId}");
            _attachments.Add(new Attachment
            {
                ReportId = report.ReportId,
                FileName = Path.GetFileName(f.FileName),
                MimeType = f.ContentType,
                StorageKey = key,
                SizeBytes = (int)f.Length,
                UploadedBy = executorId,
                UploadedAt = DateTime.Now
            });
        }
        await DbErrors.Run(_attachments.SaveAsync);
        await _audit.WriteAsync(executorId, "report_submit", "Report", report.ReportId, $"етап {stage.StageNo}");
        return report.ReportId;
    }

    // ---------- адміністратор ----------

    public Task<List<ImplementationListItem>> GetAdminListAsync() => _impl.GetListAsync(null, null);

    public async Task<ImplementationDetails> GetAdminDetailsAsync(int id) =>
        await _impl.GetDetailsAsync(id, onlyAcceptedReports: false) ?? throw new KeyNotFoundException("Картку не знайдено.");

    public Task<List<PendingReport>> GetPendingReportsAsync() => _impl.GetPendingReportsAsync();

    public Task<List<LookupItem>> GetContractorsAsync() => _impl.GetContractorsAsync();

    /// <summary>Картка реалізації для переможця; проєкт переходить у статус «реалізується».</summary>
    public async Task<int> CreateAsync(ImplementationCreateDto dto, int adminId)
    {
        var project = await _impl.GetProjectAsync(dto.ProjectId) ?? throw new KeyNotFoundException("Проєкт не знайдено.");
        if (project.Status != "winner")
            throw new BusinessRuleException("Картку реалізації можна створити лише для проєкту-переможця.");
        if (project.Implementation != null)
            throw new BusinessRuleException("Для цього проєкту картку реалізації вже створено.");
        if (dto.PlannedEndDate < dto.StartDate)
            throw new BusinessRuleException("Плановий кінець не може бути раніше початку.");

        var impl = new Implementation
        {
            ProjectId = dto.ProjectId,
            ContractorId = dto.ContractorId,
            PlannedBudget = dto.PlannedBudget,
            StartDate = dto.StartDate,
            PlannedEndDate = dto.PlannedEndDate,
            Status = "planned",
            CreatedBy = adminId,
            CreatedAt = DateTime.Now
        };
        byte no = 1;
        foreach (var s in dto.Stages)
            impl.ImplementationStages.Add(new ImplementationStage
            {
                StageNo = no++,
                Name = s.Name.Trim(),
                PlannedEndDate = s.PlannedEndDate,
                PlannedCost = s.PlannedCost,
                Status = "planned"
            });
        _impl.Add(impl);
        project.Status = "implementing";        // тригер TR_Project_StatusChange: аудит + сповіщення підписникам
        project.UpdatedAt = DateTime.Now;
        await DbErrors.Run(_impl.SaveAsync);
        return impl.ImplementationId;
    }

    /// <summary>Прийняти або відхилити звіт (відхилення — з коментарем, як і в Review).</summary>
    public async Task ReviewReportAsync(int reportId, int adminId, ReportReviewDto dto)
    {
        var report = await _impl.GetReportAsync(reportId) ?? throw new KeyNotFoundException("Звіт не знайдено.");
        if (report.Status != "submitted") throw new BusinessRuleException("Звіт уже розглянуто.");
        if (dto.Decision is not ("accepted" or "rejected")) throw new BusinessRuleException("Невідоме рішення.");
        var comment = string.IsNullOrWhiteSpace(dto.Comment) ? null : dto.Comment.Trim();
        if (dto.Decision == "rejected" && comment == null)
            throw new BusinessRuleException("Вкажіть, чому звіт не прийнято.");

        report.Status = dto.Decision;
        report.ReviewedBy = adminId;
        report.ReviewedAt = DateTime.Now;
        report.ReviewComment = comment ?? "Прийнято.";
        await DbErrors.Run(_impl.SaveAsync);
        await _audit.WriteAsync(adminId, dto.Decision == "accepted" ? "report_accept" : "report_reject", "Report", reportId, comment);
    }

    /// <summary>Статус картки; «завершено» — коли всі етапи виконано; проєкт стає «реалізовано».</summary>
    public async Task SetStatusAsync(int id, string status, int adminId)
    {
        if (!ImplementationStatuses.Contains(status)) throw new BusinessRuleException("Невідомий статус реалізації.");
        var impl = await _impl.GetEntityAsync(id) ?? throw new KeyNotFoundException("Картку не знайдено.");
        if (status == "completed" && impl.ImplementationStages.Any(s => s.Status != "done"))
            throw new BusinessRuleException("Завершити реалізацію можна, коли всі етапи виконано.");

        impl.Status = status;
        impl.ActualEndDate = status == "completed" ? DateOnly.FromDateTime(DateTime.Today) : null;
        impl.Project.Status = status == "completed" ? "completed" : "implementing";
        impl.Project.UpdatedAt = DateTime.Now;
        await DbErrors.Run(_impl.SaveAsync);
        await _audit.WriteAsync(adminId, "implementation_status", "Implementation", id, status);
    }
}
