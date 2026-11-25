namespace CivicBudget.DAL.Models;

// Моделі читання: те, що репозиторії повертають шару API (проєкції LINQ, без навігаційних властивостей EF).

public record LookupItem(int Id, string Name);

public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);

/// <summary>Фільтри каталогу проєктів.</summary>
public class ProjectFilter
{
    public short? CampaignId { get; set; }
    public string? Search { get; set; }
    public byte? CategoryId { get; set; }
    public byte? DistrictId { get; set; }
    public decimal? MinCost { get; set; }
    public decimal? MaxCost { get; set; }
    public string? Status { get; set; }
    /// <summary>votes | cost | cost_desc | new | title</summary>
    public string? Sort { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 9;
}

public record ProjectListItem(
    int ProjectId, short CampaignId, string? RegNumber, string Title, string? Summary,
    string Status, byte CategoryId, string CategoryName, byte DistrictId, string DistrictName,
    decimal Cost, int TotalVotes, string AuthorName, DateTime UpdatedAt,
    string? LastDecision, string? LastComment,
    int? ModeratorId = null, string? ModeratorName = null, int? DuplicateOfId = null);

public record BudgetItemModel(int BudgetItemId, string Name, string Unit, decimal Quantity, decimal UnitPrice, decimal Amount);

public record ReviewModel(int ReviewId, string ReviewType, string Decision, string? Comment, string ReviewerName, DateTime CreatedAt);

public record ProjectDetails(
    int ProjectId, short CampaignId, string CampaignName, string CampaignStatus,
    string? RegNumber, string Title, string? Summary, string? Description, string? Address,
    string Status, byte CategoryId, string CategoryName, byte DistrictId, string DistrictName,
    int AuthorId, string AuthorName, DateTime CreatedAt, DateTime? SubmittedAt, DateTime? PublishedAt,
    decimal Cost, int TotalVotes, int OnlineVotes, int PaperVotes, int VoterCount,
    IReadOnlyList<BudgetItemModel> BudgetItems, IReadOnlyList<ReviewModel> Reviews,
    double? Latitude, double? Longitude,
    int? ModeratorId, string? ModeratorName,
    int? DuplicateOfId, string? DuplicateOfRegNumber,
    int? ImplementationId,
    IReadOnlyList<AttachmentModel> Attachments);

public record AttachmentModel(int AttachmentId, string FileName, string MimeType, int SizeBytes, DateTime UploadedAt);

/// <summary>Точка проєкту на карті (Project.Location, geography → широта/довгота).</summary>
public record MapPoint(int ProjectId, string? RegNumber, string Title, string Status, string CategoryName,
    double Latitude, double Longitude, decimal Cost, int TotalVotes);

/// <summary>Схожий проєкт (кандидат у дублікати) і кількість спільних слів.</summary>
public record SimilarProject(int ProjectId, string? RegNumber, string Title, string Status, int CommonWords);

public record CampaignCategoryModel(byte CategoryId, string CategoryName, decimal BudgetLimit);

public record CampaignModel(
    short CampaignId, short CampaignYear, string Name, decimal TotalBudget,
    decimal MinProjectCost, decimal MaxProjectCost, byte VotesPerVoter, byte MaxVotesPerProject,
    byte MaxProjectsPerAuthor, byte MinVoterAge,
    DateOnly SubmissionStart, DateOnly SubmissionEnd, DateOnly ReviewEnd,
    DateOnly VotingStart, DateOnly VotingEnd, DateOnly ResultsDate,
    bool ShowInterimResults, string Status, IReadOnlyList<CampaignCategoryModel> Categories);

public record ResultRow(
    int ProjectId, string? RegNumber, string Title, string Status, byte CategoryId, string CategoryName,
    string DistrictName, decimal Cost, int TotalVotes, int OnlineVotes, int PaperVotes, int VoterCount);

public record VoteModel(int ProjectId, byte VoteCount, string Channel);

public record UserRow(
    int UserId, string FullName, string? Email, DateOnly? BirthDate, string VerificationStatus,
    string? VerificationMethod, bool IsBlocked, string? DistrictName, IReadOnlyList<string> Roles);

public record NotificationModel(long NotificationId, int? ProjectId, string NotifType, string Body, bool IsRead, DateTime CreatedAt);

public record CategoryStat(string CategoryName, int ProjectCount, decimal TotalCost, int TotalVotes, decimal BudgetLimit);

public record DistrictStat(string DistrictName, int ProjectCount, int TotalVotes);

public record StatusStat(string Status, int Count);

public record SummaryStat(int Users, int VerifiedUsers, int Projects, int PublishedProjects, int Votes, int OnlineVotes, int PaperVotes, int Voters);

/// <summary>Фільтри журналу аудиту: період, користувач, дія, об'єкт.</summary>
public class AuditFilter
{
    public DateTime? From { get; set; }
    public DateTime? To { get; set; }
    public string? User { get; set; }
    public string? Action { get; set; }
    public string? Entity { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}

public record AuditRow(long AuditId, DateTime CreatedAt, string? UserName, string ActionCode, string EntityName, long? EntityId, string? Details, string? IpAddress);

/// <summary>Результат usp_SubmitProject.</summary>
public record SubmitResult(int ProjectId, string RegNumber, decimal EstimatedCost);

/// <summary>Рядок рейтингу, який повертає usp_SelectWinners.</summary>
public record WinnerRow(byte CategoryId, int Place, int ProjectId, int Votes, decimal Cost, bool IsWinner);

// ---------- реалізація проєктів ----------

/// <summary>Рядок «Ходу реалізації»: план/факт з уявлення vw_ImplementationProgress.</summary>
public record ImplementationListItem(
    int ImplementationId, int ProjectId, string? RegNumber, string Title, short CampaignYear,
    string CategoryName, string DistrictName, int ContractorId, string ContractorName, string Status,
    decimal PlannedBudget, decimal ActualCost, int StagesTotal, int StagesDone,
    DateOnly StartDate, DateOnly PlannedEndDate, DateOnly? ActualEndDate, int PendingReports);

public record ReportModel(int ReportId, int StageId, string AuthorName, string Body, string Status,
    DateTime SubmittedAt, string? ReviewedByName, DateTime? ReviewedAt, string? ReviewComment,
    IReadOnlyList<AttachmentModel> Attachments);

public record StageModel(int StageId, byte StageNo, string Name, DateOnly PlannedEndDate, decimal PlannedCost,
    decimal? ActualCost, string Status, DateOnly? CompletedAt, IReadOnlyList<ReportModel> Reports);

public record ImplementationDetails(ImplementationListItem Summary, string? ContractorPhone, string? ContractorEmail,
    IReadOnlyList<StageModel> Stages);

/// <summary>Звіт виконавця в черзі адміністратора на прийняття.</summary>
public record PendingReport(int ReportId, int ImplementationId, string ProjectTitle, string? RegNumber, byte StageNo,
    string StageName, string AuthorName, string Body, DateTime SubmittedAt, IReadOnlyList<AttachmentModel> Attachments);

/// <summary>Власник файлу: для перевірки доступу до вкладення.</summary>
public record AttachmentFile(int AttachmentId, string FileName, string MimeType, string StorageKey, int SizeBytes,
    int? ProjectId, int? ReportId, int UploadedBy, string? ProjectStatus, int? ProjectAuthorId, string? ReportStatus);

/// <summary>Сповіщення, яке треба «надіслати» листом (Channel = email, SentAt IS NULL).</summary>
public record OutgoingMail(long NotificationId, string? Email, string FullName, string Body, DateTime CreatedAt);

/// <summary>Освоєння бюджету кампанії: план/факт за картками реалізації.</summary>
public record BudgetUsageStat(int Implementations, int Completed, decimal PlannedBudget, decimal ActualCost, decimal WinnersCost);
