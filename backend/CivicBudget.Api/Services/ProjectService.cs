using System.Text.RegularExpressions;
using CivicBudget.Api.Dto;
using CivicBudget.Api.Infrastructure;
using CivicBudget.DAL.Entities;
using CivicBudget.DAL.Infrastructure;
using CivicBudget.DAL.Models;
using CivicBudget.DAL.Repositories;
using NetTopologySuite.Geometries;

namespace CivicBudget.Api.Services;

/// <summary>
/// Бізнес-логіка життєвого циклу проєкту: автор (чернетка, кошторис, подання),
/// модератор (рішення, публікація), експерт (висновок).
/// Зміну статусу записує в журнал і розсилає сповіщення тригер TR_Project_StatusChange.
/// </summary>
public class ProjectService
{
    public static readonly string[] PublicStatuses = { "published", "winner", "not_selected", "implementing", "completed" };
    private static readonly string[] EditableStatuses = { "draft", "revision" };

    public const int MaxAttachmentsPerProject = 10;

    private readonly IProjectRepository _projects;
    private readonly ICampaignRepository _campaigns;
    private readonly IProcedureRepository _procedures;
    private readonly IAttachmentRepository _attachments;
    private readonly IUserRepository _users;
    private readonly FileStorage _files;

    public ProjectService(IProjectRepository projects, ICampaignRepository campaigns, IProcedureRepository procedures,
        IAttachmentRepository attachments, IUserRepository users, FileStorage files)
    {
        _projects = projects;
        _campaigns = campaigns;
        _procedures = procedures;
        _attachments = attachments;
        _users = users;
        _files = files;
    }

    // ---------- публічна частина ----------

    public Task<PagedResult<ProjectListItem>> SearchAsync(ProjectFilter filter) =>
        _projects.SearchAsync(filter, PublicStatuses);

    public Task<List<MapPoint>> GetMapPointsAsync(ProjectFilter filter) =>
        _projects.GetMapPointsAsync(filter, PublicStatuses);

    /// <summary>Картка проєкту. Непублічні проєкти бачать лише автор і працівники.</summary>
    public async Task<ProjectDetails> GetDetailsAsync(int projectId, int? userId, bool isStaff)
    {
        var p = await _projects.GetDetailsAsync(projectId) ?? throw new KeyNotFoundException("Проєкт не знайдено.");
        if (!PublicStatuses.Contains(p.Status) && !isStaff && p.AuthorId != userId)
            throw new KeyNotFoundException("Проєкт не знайдено.");
        return p;
    }

    // ---------- автор ----------

    public Task<List<ProjectListItem>> GetMineAsync(int authorId) => _projects.GetByAuthorAsync(authorId);

    public async Task<ProjectForEdit> GetForEditAsync(int projectId, int authorId)
    {
        var p = await _projects.GetDetailsAsync(projectId) ?? throw new KeyNotFoundException("Проєкт не знайдено.");
        if (p.AuthorId != authorId) throw new UnauthorizedAccessException("Це не ваш проєкт.");

        var revisionComment = p.Status == "revision"
            ? p.Reviews.FirstOrDefault(r => r.Decision == "revise")?.Comment
            : null;
        return new ProjectForEdit(p, EditableStatuses.Contains(p.Status), revisionComment);
    }

    /// <summary>Нова чернетка в поточній кампанії.</summary>
    public async Task<int> CreateDraftAsync(int authorId, ProjectEditDto dto)
    {
        var campaign = await _campaigns.GetCurrentAsync()
                       ?? throw new BusinessRuleException("Немає активної кампанії громадського бюджету.");
        if (campaign.Categories.All(c => c.CategoryId != dto.CategoryId))
            throw new BusinessRuleException("Ця категорія не відкрита в поточній кампанії.");

        var now = DateTime.Now;
        var project = new Project
        {
            CampaignId = campaign.CampaignId,
            AuthorId = authorId,
            Status = "draft",
            CreatedAt = now,
        };
        Apply(project, dto, now);
        _projects.Add(project);
        await DbErrors.Run(_projects.SaveAsync);
        return project.ProjectId;
    }

    /// <summary>Збереження чернетки або проєкту на доопрацюванні разом із кошторисом.</summary>
    public async Task UpdateDraftAsync(int projectId, int authorId, ProjectEditDto dto)
    {
        var project = await _projects.GetEntityAsync(projectId) ?? throw new KeyNotFoundException("Проєкт не знайдено.");
        if (project.AuthorId != authorId) throw new UnauthorizedAccessException("Це не ваш проєкт.");
        if (!EditableStatuses.Contains(project.Status))
            throw new BusinessRuleException("Редагувати можна лише чернетку або проєкт, повернутий на доопрацювання.");

        // кошторис замінюємо повністю: старі позиції видаляємо, нові додаємо
        _projects.RemoveBudgetItems(project.BudgetItems.ToList());
        project.BudgetItems.Clear();
        Apply(project, dto, DateTime.Now);
        await DbErrors.Run(_projects.SaveAsync);
    }

    /// <summary>Подання: викликає usp_SubmitProject через ADO.NET (перевірки 50010–50015 — у процедурі).</summary>
    public async Task<SubmitResult> SubmitAsync(int projectId, int authorId)
    {
        var project = await _projects.GetEntityAsync(projectId) ?? throw new KeyNotFoundException("Проєкт не знайдено.");
        if (project.AuthorId != authorId) throw new UnauthorizedAccessException("Це не ваш проєкт.");
        return await _procedures.SubmitProjectAsync(projectId);
    }

    private static void Apply(Project p, ProjectEditDto dto, DateTime now)
    {
        if (dto.Latitude.HasValue != dto.Longitude.HasValue)
            throw new BusinessRuleException("Оберіть точку на карті або приберіть її повністю.");
        // geography, SRID 4326 (WGS 84): у NetTopologySuite X — довгота, Y — широта
        p.Location = dto.Latitude.HasValue
            ? new Point(dto.Longitude!.Value, dto.Latitude.Value) { SRID = 4326 }
            : null;
        p.Title = dto.Title.Trim();
        p.Summary = Clean(dto.Summary);
        p.Description = Clean(dto.Description);
        p.Address = Clean(dto.Address);
        p.CategoryId = dto.CategoryId;
        p.DistrictId = dto.DistrictId;
        p.UpdatedAt = now;
        foreach (var item in dto.BudgetItems)
            p.BudgetItems.Add(new BudgetItem
            {
                Name = item.Name.Trim(),
                Unit = item.Unit.Trim(),
                Quantity = item.Quantity,
                UnitPrice = item.UnitPrice
            });
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    // ---------- схожі проєкти (попередження про дублікат) ----------

    private static readonly HashSet<string> StopWords = new()
    {
        "проєкт", "проект", "вулиця", "вулиці", "встано", "облашт", "створе", "ремонт", "міста", "району", "районі"
    };

    /// <summary>
    /// Ключові слова тексту: слова від 5 літер, обрізані до 6 перших літер (грубе відкидання закінчень:
    /// «майданчик», «майданчика» → «майдан»), без загальних слів.
    /// </summary>
    public static List<string> KeyWords(params string?[] texts) =>
        texts.Where(t => !string.IsNullOrWhiteSpace(t))
            .SelectMany(t => Regex.Split(t!.ToLowerInvariant(), @"[^\p{L}'’]+"))
            .Where(w => w.Length >= 5)
            .Select(w => w.Length > 6 ? w[..6] : w)
            .Where(w => !StopWords.Contains(w))
            .Distinct()
            .ToList();

    /// <summary>Схожі проєкти поточної кампанії — автор бачить попередження ще до подання.</summary>
    public async Task<List<SimilarProject>> FindSimilarAsync(int? projectId, string? title, string? summary, string? description)
    {
        short campaignId;
        if (projectId.HasValue)
        {
            var p = await _projects.GetEntityAsync(projectId.Value) ?? throw new KeyNotFoundException("Проєкт не знайдено.");
            campaignId = p.CampaignId;
            title ??= p.Title;
            summary ??= p.Summary;
            description ??= p.Description;
        }
        else
        {
            var campaign = await _campaigns.GetCurrentAsync();
            if (campaign == null) return new();
            campaignId = campaign.CampaignId;
        }
        return await _projects.FindSimilarAsync(campaignId, projectId, KeyWords(title, summary, description));
    }

    // ---------- вкладення проєкту ----------

    public async Task<AttachmentModel> AddAttachmentAsync(int projectId, int authorId, IFormFile file)
    {
        var project = await _projects.GetEntityAsync(projectId) ?? throw new KeyNotFoundException("Проєкт не знайдено.");
        if (project.AuthorId != authorId) throw new UnauthorizedAccessException("Це не ваш проєкт.");
        if (!EditableStatuses.Contains(project.Status))
            throw new BusinessRuleException("Додавати файли можна лише до чернетки або проєкту на доопрацюванні.");
        if (await _attachments.CountForProjectAsync(projectId) >= MaxAttachmentsPerProject)
            throw new BusinessRuleException($"До проєкту можна додати не більше {MaxAttachmentsPerProject} файлів.");

        var key = await _files.SaveAsync(file, $"projects/{projectId}");
        var attachment = new Attachment
        {
            ProjectId = projectId,
            FileName = Path.GetFileName(file.FileName),
            MimeType = file.ContentType,
            StorageKey = key,
            SizeBytes = (int)file.Length,
            UploadedBy = authorId,
            UploadedAt = DateTime.Now
        };
        _attachments.Add(attachment);
        try
        {
            await DbErrors.Run(_attachments.SaveAsync);
        }
        catch
        {
            _files.Delete(key);
            throw;
        }
        return new AttachmentModel(attachment.AttachmentId, attachment.FileName, attachment.MimeType, attachment.SizeBytes, attachment.UploadedAt);
    }

    public async Task DeleteAttachmentAsync(int projectId, int attachmentId, int authorId)
    {
        var file = await _attachments.GetAsync(attachmentId);
        if (file == null || file.ProjectId != projectId) throw new KeyNotFoundException("Файл не знайдено.");
        if (file.ProjectAuthorId != authorId) throw new UnauthorizedAccessException("Це не ваш проєкт.");
        if (!EditableStatuses.Contains(file.ProjectStatus ?? ""))
            throw new BusinessRuleException("Видаляти файли можна лише з чернетки або проєкту на доопрацюванні.");
        await _attachments.RemoveAsync(attachmentId);
        _files.Delete(file.StorageKey);
    }

    // ---------- модератор ----------

    /// <summary>
    /// Черга модератора: подані й ті, що на модерації. «Готові до публікації» — статус moderation,
    /// останнє рішення — approve (модератор допустив або експерт дав позитивний висновок).
    /// </summary>
    public async Task<ModerationQueue> GetModerationQueueAsync()
    {
        var all = await _projects.GetByStatusesAsync(new[] { "submitted", "moderation" });
        var ready = all.Where(p => p.Status == "moderation" && p.LastDecision == "approve").ToList();
        var queue = all.Except(ready).ToList();
        return new ModerationQueue(queue, ready, await _users.GetByRoleAsync("moderator"));
    }

    /// <summary>
    /// Призначення відповідального модератора (Project.ModeratorId). Поданий проєкт
    /// при цьому переходить у статус «на модерації» — тригер повідомить автора.
    /// </summary>
    public async Task AssignModeratorAsync(int projectId, int moderatorId)
    {
        var project = await _projects.GetEntityAsync(projectId) ?? throw new KeyNotFoundException("Проєкт не знайдено.");
        if (project.Status is not ("submitted" or "moderation"))
            throw new BusinessRuleException("Призначити модератора можна лише проєкту в черзі модерації.");
        if ((await _users.GetByRoleAsync("moderator")).All(m => m.Id != moderatorId))
            throw new BusinessRuleException("Обраний користувач не є модератором.");

        project.ModeratorId = moderatorId;
        if (project.Status == "submitted") project.Status = "moderation";
        project.UpdatedAt = DateTime.Now;
        await DbErrors.Run(_projects.SaveAsync);
    }

    public async Task ModerateAsync(int projectId, int moderatorId, ModerationDecisionDto dto)
    {
        var project = await _projects.GetEntityAsync(projectId) ?? throw new KeyNotFoundException("Проєкт не знайдено.");
        if (project.Status is not ("submitted" or "moderation"))
            throw new BusinessRuleException("Проєкт не перебуває на модерації.");

        var comment = Clean(dto.Comment);
        (string decision, string newStatus) = dto.Decision switch
        {
            "approve" => ("approve", "moderation"),
            "expertise" => ("approve", "expertise"),
            "revise" => ("revise", "revision"),
            "reject" => ("reject", "rejected"),
            "duplicate" => ("reject", "rejected"),
            _ => throw new BusinessRuleException("Невідоме рішення.")
        };

        // дублікат: посилання на оригінал (Project.DuplicateOfId) і відхилення з поясненням
        if (dto.Decision == "duplicate")
        {
            if (dto.DuplicateOfId is not int originalId || originalId == projectId)
                throw new BusinessRuleException("Оберіть проєкт, дублікатом якого є цей.");
            var original = await _projects.GetEntityAsync(originalId) ?? throw new KeyNotFoundException("Оригінал не знайдено.");
            project.DuplicateOfId = originalId;
            comment ??= $"Проєкт дублює {original.RegNumber ?? "проєкт"} «{original.Title}».";
        }
        if (decision != "approve" && comment == null)
            throw new BusinessRuleException(decision == "revise"
                ? "Вкажіть, що саме автору треба доопрацювати."
                : "Вкажіть обґрунтування відхилення.");
        if (dto.Decision == "expertise") comment ??= "Передано на експертизу.";

        _projects.AddReview(new Review
        {
            ProjectId = projectId,
            ReviewerId = moderatorId,
            ReviewType = "moderation",
            Decision = decision,
            Comment = comment,
            CreatedAt = DateTime.Now
        });
        project.ModeratorId = moderatorId;
        project.Status = newStatus;
        project.UpdatedAt = DateTime.Now;
        await DbErrors.Run(_projects.SaveAsync);
    }

    /// <summary>Публікація допущеного проєкту — він з'являється в каталозі й бере участь у голосуванні.</summary>
    public async Task PublishAsync(int projectId, int moderatorId)
    {
        var queue = await GetModerationQueueAsync();
        if (queue.ReadyToPublish.All(p => p.ProjectId != projectId))
            throw new BusinessRuleException("Опублікувати можна лише допущений проєкт.");

        var project = (await _projects.GetEntityAsync(projectId))!;
        project.Status = "published";
        project.PublishedAt = DateTime.Now;
        project.UpdatedAt = DateTime.Now;
        project.ModeratorId ??= moderatorId;
        await DbErrors.Run(_projects.SaveAsync);
    }

    // ---------- експерт ----------

    public Task<List<ProjectListItem>> GetExpertiseQueueAsync() =>
        _projects.GetByStatusesAsync(new[] { "expertise" });

    public async Task ConcludeAsync(int projectId, int expertId, ExpertConclusionDto dto)
    {
        var project = await _projects.GetEntityAsync(projectId) ?? throw new KeyNotFoundException("Проєкт не знайдено.");
        if (project.Status != "expertise")
            throw new BusinessRuleException("Проєкт не перебуває на експертизі.");
        if (dto.ReviewType is not ("technical" or "legal" or "financial"))
            throw new BusinessRuleException("Оберіть вид експертизи.");

        var comment = Clean(dto.Comment);
        string newStatus = dto.Decision switch
        {
            "approve" => "moderation",   // повертається модератору як «готовий до публікації»
            "revise" => "revision",
            "reject" => "rejected",
            _ => throw new BusinessRuleException("Невідоме рішення.")
        };
        if (dto.Decision != "approve" && comment == null)
            throw new BusinessRuleException("Для повернення або відхилення потрібен коментар експерта.");

        _projects.AddReview(new Review
        {
            ProjectId = projectId,
            ReviewerId = expertId,
            ReviewType = dto.ReviewType,
            Decision = dto.Decision,
            Comment = comment,
            CreatedAt = DateTime.Now
        });
        project.Status = newStatus;
        project.UpdatedAt = DateTime.Now;
        await DbErrors.Run(_projects.SaveAsync);
    }
}
