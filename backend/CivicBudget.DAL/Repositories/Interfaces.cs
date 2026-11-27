using CivicBudget.DAL.Entities;
using CivicBudget.DAL.Models;

namespace CivicBudget.DAL.Repositories;

// Інтерфейси репозиторіїв — шаблон DAL: шар API працює лише з цими контрактами
// і не знає, як саме (EF Core чи ADO.NET) дані отримано з SQL Server.

public interface IReferenceRepository
{
    Task<List<LookupItem>> GetCategoriesAsync();
    Task<List<LookupItem>> GetDistrictsAsync();
    Task<List<LookupItem>> GetPollingStationsAsync();
    Task<List<AppRole>> GetRolesAsync();
}

public interface ICampaignRepository
{
    /// <summary>Поточна кампанія — найновіша незакрита.</summary>
    Task<CampaignModel?> GetCurrentAsync();
    Task<CampaignModel?> GetModelAsync(short campaignId);
    Task<List<CampaignModel>> GetAllAsync();
    Task<Campaign?> GetEntityAsync(short campaignId);
    void Add(Campaign campaign);
    Task SaveAsync();
}

public interface IProjectRepository
{
    Task<PagedResult<ProjectListItem>> SearchAsync(ProjectFilter filter, IReadOnlyCollection<string> allowedStatuses);
    Task<ProjectDetails?> GetDetailsAsync(int projectId);
    Task<Project?> GetEntityAsync(int projectId);
    Task<List<ProjectListItem>> GetByAuthorAsync(int authorId);
    Task<List<ProjectListItem>> GetByStatusesAsync(IReadOnlyCollection<string> statuses);
    Task<List<ResultRow>> GetResultsAsync(short campaignId);
    Task<int> CountAuthorProjectsAsync(int authorId, short campaignId);
    /// <summary>Точки на карті з тими самими фільтрами, що й каталог.</summary>
    Task<List<MapPoint>> GetMapPointsAsync(ProjectFilter filter, IReadOnlyCollection<string> allowedStatuses);
    /// <summary>Схожі проєкти кампанії: збіг слів у назві чи описі (попередження про дублікат).</summary>
    Task<List<SimilarProject>> FindSimilarAsync(short campaignId, int? excludeProjectId, IReadOnlyCollection<string> words);
    void Add(Project project);
    void AddReview(Review review);
    void RemoveBudgetItems(IEnumerable<BudgetItem> items);
    Task SaveAsync();
}

public interface IVoteRepository
{
    Task<List<VoteModel>> GetVoterVotesAsync(int voterId, short campaignId);
    Task<Vote?> GetAsync(int voterId, int projectId);
    void Add(Vote vote);
    void AddRange(IEnumerable<Vote> votes);
    Task SaveAsync();
}

public interface IUserRepository
{
    Task<UserAccount?> GetByEmailAsync(string email);
    Task<UserAccount?> GetByIdAsync(int userId);
    Task<PagedResult<UserRow>> SearchAsync(string? search, int page, int pageSize);
    Task<List<UserRow>> GetBankIdDemoUsersAsync();
    Task<List<UserRow>> SearchVotersAsync(string search);
    Task SetRolesAsync(int userId, IReadOnlyCollection<string> roleCodes, int assignedBy);
    Task SetBlockedAsync(int userId, bool isBlocked, int byUserId);
    Task SetTwoFactorAsync(int userId, bool enabled, int byUserId);
    Task<bool> ExistsAsync(string? email, string? identityHash);
    /// <summary>Реєстрація: новий обліковий запис з роллю «мешканець».</summary>
    Task<UserAccount> RegisterAsync(UserAccount user, string roleCode);
    /// <summary>Автоблокування після невдалих спроб входу (системна подія в AuditLog).</summary>
    Task BlockAfterFailedLoginsAsync(int userId, int attempts);
    Task<List<LookupItem>> GetByRoleAsync(string roleCode);
}

public interface INotificationRepository
{
    Task<List<NotificationModel>> GetForUserAsync(int userId, int take = 50);
    Task<int> CountUnreadAsync(int userId);
    Task MarkReadAsync(int userId, long? notificationId);
    Task<bool> IsSubscribedAsync(int userId, int projectId);
    Task SetSubscriptionAsync(int userId, int projectId, bool subscribe);
    /// <summary>Ще не «надіслані» листи (Notification.Channel = email, SentAt IS NULL).</summary>
    Task<List<OutgoingMail>> GetUnsentMailAsync(int take);
    Task MarkSentAsync(IReadOnlyCollection<long> notificationIds);
}

public interface IStatisticsRepository
{
    Task<List<CategoryStat>> GetByCategoryAsync(short campaignId);
    Task<List<DistrictStat>> GetByDistrictAsync(short campaignId);
    Task<List<StatusStat>> GetByStatusAsync(short campaignId);
    Task<SummaryStat> GetSummaryAsync(short campaignId);
    Task<BudgetUsageStat> GetBudgetUsageAsync(short campaignId);
}

/// <summary>Журнал аудиту — від'єднаний сценарій ADO.NET (SqlDataAdapter + DataTable).</summary>
public interface IAuditRepository
{
    Task<PagedResult<AuditRow>> GetPageAsync(AuditFilter filter);
    /// <summary>Довідник для фільтрів: наявні коди дій і назви об'єктів.</summary>
    Task<(List<string> Actions, List<string> Entities)> GetFilterValuesAsync();
    Task WriteAsync(int? userId, string actionCode, string entityName, long? entityId, string? details);
    /// <summary>Історія статусів проєкту: записи project_status, які створює тригер TR_Project_StatusChange.</summary>
    Task<List<StatusHistoryItem>> GetProjectStatusHistoryAsync(int projectId);
}

/// <summary>Збережені процедури — з'єднаний сценарій ADO.NET (SqlConnection + SqlCommand + SqlDataReader).</summary>
public interface IProcedureRepository
{
    Task<SubmitResult> SubmitProjectAsync(int projectId);
    Task<List<WinnerRow>> SelectWinnersAsync(short campaignId);
}

/// <summary>Функції користувача fn_RemainingVotes і fn_CategoryBudgetBalance — ADO.NET.</summary>
public interface IFunctionRepository
{
    Task<int> GetRemainingVotesAsync(int voterId, short campaignId);
    Task<List<CategoryBalance>> GetCategoryBalanceAsync(short campaignId);
    Task<List<VoterStatus>> FindVotersAsync(string name, DateOnly? birthDate, short campaignId);
}

/// <summary>Вкладення (таблиця Attachment): метадані в БД, самі файли — у локальній папці сервера.</summary>
public interface IAttachmentRepository
{
    Task<AttachmentFile?> GetAsync(int attachmentId);
    Task<int> CountForProjectAsync(int projectId);
    void Add(Attachment attachment);
    Task RemoveAsync(int attachmentId);
    Task SaveAsync();
}

/// <summary>Картки реалізації, етапи, звіти виконавців.</summary>
public interface IImplementationRepository
{
    Task<List<ImplementationListItem>> GetListAsync(short? campaignId, int? contractorId);
    Task<ImplementationDetails?> GetDetailsAsync(int implementationId, bool onlyAcceptedReports);
    Task<Implementation?> GetEntityAsync(int implementationId);
    Task<ImplementationStage?> GetStageAsync(int stageId);
    Task<Report?> GetReportAsync(int reportId);
    Task<List<PendingReport>> GetPendingReportsAsync();
    Task<List<LookupItem>> GetContractorsAsync();
    Task<Project?> GetProjectAsync(int projectId);
    void Add(Implementation implementation);
    void AddReport(Report report);
    Task SaveAsync();
}
