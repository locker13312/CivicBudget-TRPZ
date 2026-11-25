using System.ComponentModel.DataAnnotations;
using CivicBudget.DAL.Models;

namespace CivicBudget.Api.Dto;

// ---------- автентифікація ----------

public record LoginRequest(
    [Required(ErrorMessage = "Вкажіть e-mail.")] string Email,
    [Required(ErrorMessage = "Вкажіть пароль.")] string Password);

public record BankIdDemoRequest(int UserId);

public record RefreshRequest([Required] string RefreshToken);

public record UserInfo(int UserId, string FullName, string? Email, IReadOnlyList<string> Roles,
    string VerificationStatus, string? VerificationMethod, DateOnly? BirthDate);

public record AuthResponse(string AccessToken, string RefreshToken, DateTime AccessExpiresAt, UserInfo User);

/// <summary>
/// Відповідь на вхід: або токени, або RequiresTwoFactor = true і ChallengeId —
/// тоді код із листа треба підтвердити через POST /api/auth/2fa.
/// </summary>
public record LoginResponse(bool RequiresTwoFactor, string? ChallengeId, string? Message,
    string? AccessToken, string? RefreshToken, DateTime? AccessExpiresAt, UserInfo? User)
{
    public static LoginResponse From(AuthResponse a) =>
        new(false, null, null, a.AccessToken, a.RefreshToken, a.AccessExpiresAt, a.User);
}

public record TwoFactorRequest([Required] string ChallengeId,
    [Required(ErrorMessage = "Введіть код із листа.")] string Code);

/// <summary>Реєстрація: обрана в «банку» особа + e-mail і пароль для подальшого входу.</summary>
public record RegisterRequest(
    [Range(1, int.MaxValue, ErrorMessage = "Підтвердіть особу через BankID або Дія.Підпис.")] int PersonId,
    [Required] string Method,
    [Required(ErrorMessage = "Вкажіть e-mail."), EmailAddress(ErrorMessage = "Некоректний e-mail."), StringLength(254)] string Email,
    [Required(ErrorMessage = "Вкажіть пароль."), StringLength(100, MinimumLength = 8, ErrorMessage = "Пароль — щонайменше 8 символів.")] string Password);

// ---------- проєкти ----------

public class BudgetItemDto
{
    [Required(ErrorMessage = "Вкажіть назву позиції кошторису.")]
    [StringLength(200, ErrorMessage = "Назва позиції — до 200 символів.")]
    public string Name { get; set; } = "";

    [Required(ErrorMessage = "Вкажіть одиницю виміру.")]
    [StringLength(20, ErrorMessage = "Одиниця виміру — до 20 символів.")]
    public string Unit { get; set; } = "";

    [Range(0.01, 99999999, ErrorMessage = "Кількість має бути більшою за нуль.")]
    public decimal Quantity { get; set; }

    [Range(0, 9999999999, ErrorMessage = "Ціна не може бути від'ємною.")]
    public decimal UnitPrice { get; set; }
}

public class ProjectEditDto
{
    [Required(ErrorMessage = "Вкажіть назву проєкту.")]
    [StringLength(200, MinimumLength = 5, ErrorMessage = "Назва — від 5 до 200 символів.")]
    public string Title { get; set; } = "";

    [StringLength(500, ErrorMessage = "Короткий опис — до 500 символів.")]
    public string? Summary { get; set; }

    public string? Description { get; set; }

    [StringLength(200, ErrorMessage = "Адреса — до 200 символів.")]
    public string? Address { get; set; }

    [Range(1, 255, ErrorMessage = "Оберіть категорію.")]
    public byte CategoryId { get; set; }

    [Range(1, 255, ErrorMessage = "Оберіть район.")]
    public byte DistrictId { get; set; }

    public List<BudgetItemDto> BudgetItems { get; set; } = new();

    /// <summary>Точка на карті (Project.Location). Обидві координати або жодної.</summary>
    [Range(-90, 90)] public double? Latitude { get; set; }
    [Range(-180, 180)] public double? Longitude { get; set; }
}

public record ProjectForEdit(ProjectDetails Project, bool CanEdit, string? RevisionComment);

// ---------- модерація та експертиза ----------

/// <summary>Рішення модератора: approve (допустити) | revise | reject | expertise.</summary>
public record ModerationDecisionDto([Required] string Decision, string? Comment, int? DuplicateOfId = null);

/// <summary>Призначення відповідального модератора.</summary>
public record AssignModeratorDto([Range(1, int.MaxValue, ErrorMessage = "Оберіть модератора.")] int ModeratorId);

public record ModerationQueue(IReadOnlyList<ProjectListItem> Queue, IReadOnlyList<ProjectListItem> ReadyToPublish,
    IReadOnlyList<LookupItem> Moderators);

/// <summary>Висновок експерта: тип technical | legal | financial; рішення approve | revise | reject.</summary>
public record ExpertConclusionDto([Required] string ReviewType, [Required] string Decision, string? Comment);


// ---------- голосування ----------

public record BallotProject(int ProjectId, string? RegNumber, string Title, string CategoryName, string DistrictName,
    decimal Cost, int TotalVotes, int MyVotes);

public record MyBallot(CampaignModel? Campaign, bool VotingOpen, int VotesPerVoter, int MaxVotesPerProject,
    int Used, int Remaining, string? Channel, IReadOnlyList<BallotProject> Projects);

public record PaperBallotItem(int ProjectId, [Range(1, 10)] byte Count);

public record PaperBallotDto(
    [Range(1, int.MaxValue, ErrorMessage = "Оберіть виборця.")] int VoterId,
    [Range(1, short.MaxValue, ErrorMessage = "Оберіть пункт голосування.")] short StationId,
    [MinLength(1, ErrorMessage = "Позначте хоча б один проєкт.")] List<PaperBallotItem> Items);

// ---------- адміністрування ----------

public class CampaignEditDto
{
    [Range(2000, 2100, ErrorMessage = "Некоректний рік.")] public short CampaignYear { get; set; }
    [Required(ErrorMessage = "Вкажіть назву кампанії."), StringLength(150)] public string Name { get; set; } = "";
    [Range(1, 9999999999)] public decimal TotalBudget { get; set; }
    [Range(1, 9999999999)] public decimal MinProjectCost { get; set; } = 50000;
    [Range(1, 9999999999)] public decimal MaxProjectCost { get; set; }
    [Range(1, 50)] public byte VotesPerVoter { get; set; } = 5;
    [Range(1, 50)] public byte MaxVotesPerProject { get; set; } = 2;
    [Range(1, 50)] public byte MaxProjectsPerAuthor { get; set; } = 5;
    [Range(14, 100)] public byte MinVoterAge { get; set; } = 16;
    public DateOnly SubmissionStart { get; set; }
    public DateOnly SubmissionEnd { get; set; }
    public DateOnly ReviewEnd { get; set; }
    public DateOnly VotingStart { get; set; }
    public DateOnly VotingEnd { get; set; }
    public DateOnly ResultsDate { get; set; }
    public bool ShowInterimResults { get; set; }
    public List<CategoryLimitDto> Categories { get; set; } = new();
}

public record CategoryLimitDto(byte CategoryId, [Range(1, 9999999999)] decimal BudgetLimit);

public record CampaignStatusDto([Required] string Status);

public record WinnerRowDto(byte CategoryId, string CategoryName, decimal CategoryLimit, int Place, int ProjectId,
    string? RegNumber, string Title, int Votes, decimal Cost, bool IsWinner);

public record UserRolesDto(List<string> Roles);

public record UserBlockDto(bool IsBlocked);

public record UserTwoFactorDto(bool Enabled);

// ---------- реалізація ----------

public class StageEditDto
{
    [Required(ErrorMessage = "Вкажіть назву етапу."), StringLength(150)] public string Name { get; set; } = "";
    public DateOnly PlannedEndDate { get; set; }
    [Range(0, 9999999999)] public decimal PlannedCost { get; set; }
}

/// <summary>Картка реалізації для проєкту-переможця (адміністратор).</summary>
public class ImplementationCreateDto
{
    [Range(1, int.MaxValue, ErrorMessage = "Оберіть проєкт.")] public int ProjectId { get; set; }
    [Range(1, int.MaxValue, ErrorMessage = "Оберіть підрядника.")] public int ContractorId { get; set; }
    [Range(1, 9999999999, ErrorMessage = "Вкажіть плановий бюджет.")] public decimal PlannedBudget { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly PlannedEndDate { get; set; }
    [MinLength(1, ErrorMessage = "Додайте хоча б один етап.")] public List<StageEditDto> Stages { get; set; } = new();
}

/// <summary>Оновлення етапу виконавцем: статус і фактичні витрати.</summary>
public record StageUpdateDto([Required] string Status, [Range(0, 9999999999)] decimal? ActualCost);

public record ReportReviewDto([Required] string Decision, string? Comment);

public record ImplementationStatusDto([Required] string Status);


public record ResultsResponse(CampaignModel Campaign, bool VotesHidden, IReadOnlyList<ResultRow> Rows);

public record StatisticsResponse(CampaignModel Campaign, SummaryStat Summary, IReadOnlyList<CategoryStat> ByCategory,
    IReadOnlyList<DistrictStat> ByDistrict, IReadOnlyList<StatusStat> ByStatus, BudgetUsageStat BudgetUsage);

public record MessageResponse(string Message);

public record SimilarRequest(int? ProjectId, string? Title, string? Summary, string? Description);
