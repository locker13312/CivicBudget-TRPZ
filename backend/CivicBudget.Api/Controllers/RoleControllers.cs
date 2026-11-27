using CivicBudget.Api.Auth;
using CivicBudget.Api.Dto;
using CivicBudget.Api.Services;
using CivicBudget.Api.Infrastructure;
using CivicBudget.DAL.Models;
using CivicBudget.DAL.Repositories;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CivicBudget.Api.Controllers;

/// <summary>Автор: мої проєкти, чернетка з кошторисом, подання (usp_SubmitProject).</summary>
[ApiController]
[Authorize(Roles = Roles.Resident)]
[Route("api/my/projects")]
public class MyProjectsController : ControllerBase
{
    private readonly ProjectService _projects;
    private readonly HttpCurrentUser _user;

    public MyProjectsController(ProjectService projects, HttpCurrentUser user)
    {
        _projects = projects;
        _user = user;
    }

    [HttpGet]
    public Task<List<ProjectListItem>> Mine() => _projects.GetMineAsync(_user.RequireUserId());

    [HttpGet("{id:int}")]
    public Task<ProjectForEdit> Get(int id) => _projects.GetForEditAsync(id, _user.RequireUserId());

    /// <summary>Створити чернетку.</summary>
    [HttpPost]
    public async Task<object> Create(ProjectEditDto dto) =>
        new { projectId = await _projects.CreateDraftAsync(_user.RequireUserId(), dto) };

    /// <summary>Зберегти чернетку (або проєкт на доопрацюванні).</summary>
    [HttpPut("{id:int}")]
    public async Task<MessageResponse> Update(int id, ProjectEditDto dto)
    {
        await _projects.UpdateDraftAsync(id, _user.RequireUserId(), dto);
        return new MessageResponse("Чернетку збережено.");
    }

    /// <summary>Подати проєкт — виклик usp_SubmitProject через ADO.NET.</summary>
    [HttpPost("{id:int}/submit")]
    public Task<SubmitResult> Submit(int id) => _projects.SubmitAsync(id, _user.RequireUserId());

    /// <summary>Схожі проєкти поточної кампанії (попередження про можливий дублікат).</summary>
    [HttpPost("similar")]
    public Task<List<SimilarProject>> Similar(SimilarRequest request) =>
        _projects.FindSimilarAsync(request.ProjectId, request.Title, request.Summary, request.Description);

    /// <summary>Додати вкладення (JPG, PNG, PDF до 20 МБ) до чернетки або проєкту на доопрацюванні.</summary>
    [HttpPost("{id:int}/attachments")]
    [RequestSizeLimit(21 * 1024 * 1024)]
    public Task<AttachmentModel> Upload(int id, IFormFile file) =>
        _projects.AddAttachmentAsync(id, _user.RequireUserId(), file);

    [HttpDelete("{id:int}/attachments/{attachmentId:int}")]
    public async Task<IActionResult> DeleteAttachment(int id, int attachmentId)
    {
        await _projects.DeleteAttachmentAsync(id, attachmentId, _user.RequireUserId());
        return NoContent();
    }
}

/// <summary>Модератор: черга, рішення, публікація.</summary>
[ApiController]
[Authorize(Roles = Roles.Moderator)]
[Route("api/moderation")]
public class ModerationController : ControllerBase
{
    private readonly ProjectService _projects;
    private readonly HttpCurrentUser _user;

    public ModerationController(ProjectService projects, HttpCurrentUser user)
    {
        _projects = projects;
        _user = user;
    }

    [HttpGet("queue")]
    public Task<ModerationQueue> Queue() => _projects.GetModerationQueueAsync();

    /// <summary>Рішення: approve (допустити) | revise (на доопрацювання) | reject (відхилити) | expertise (на експертизу).</summary>
    [HttpPost("{id:int}/decision")]
    public async Task<MessageResponse> Decide(int id, ModerationDecisionDto dto)
    {
        await _projects.ModerateAsync(id, _user.RequireUserId(), dto);
        return new MessageResponse("Рішення збережено.");
    }

    /// <summary>Призначити відповідального модератора.</summary>
    [HttpPost("{id:int}/assign")]
    public async Task<MessageResponse> Assign(int id, AssignModeratorDto dto)
    {
        var name = await _projects.AssignModeratorAsync(id, dto.ModeratorId);
        return new MessageResponse($"Призначено модератора: {name}.");
    }

    /// <summary>Схожі проєкти — кандидати в дублікати.</summary>
    [HttpGet("{id:int}/similar")]
    public Task<List<SimilarProject>> Similar(int id) => _projects.FindSimilarAsync(id, null, null, null);

    [HttpPost("{id:int}/publish")]
    public async Task<MessageResponse> Publish(int id)
    {
        await _projects.PublishAsync(id, _user.RequireUserId());
        return new MessageResponse("Проєкт опубліковано.");
    }
}

/// <summary>Експерт: проєкти на експертизі, висновок.</summary>
[ApiController]
[Authorize(Roles = Roles.Expert)]
[Route("api/expertise")]
public class ExpertiseController : ControllerBase
{
    private readonly ProjectService _projects;
    private readonly HttpCurrentUser _user;

    public ExpertiseController(ProjectService projects, HttpCurrentUser user)
    {
        _projects = projects;
        _user = user;
    }

    [HttpGet]
    public Task<List<ProjectListItem>> Queue() => _projects.GetExpertiseQueueAsync();

    [HttpPost("{id:int}/conclusion")]
    public async Task<MessageResponse> Conclude(int id, ExpertConclusionDto dto)
    {
        await _projects.ConcludeAsync(id, _user.RequireUserId(), dto);
        return new MessageResponse("Висновок збережено.");
    }
}

/// <summary>Мешканець: онлайн-голосування.</summary>
[ApiController]
[Authorize(Roles = Roles.Resident)]
[Route("api/voting")]
public class VotingController : ControllerBase
{
    private readonly VotingService _voting;
    private readonly HttpCurrentUser _user;

    public VotingController(VotingService voting, HttpCurrentUser user)
    {
        _voting = voting;
        _user = user;
    }

    /// <summary>Мій бюлетень: проєкти, мої голоси, скільки лишилось.</summary>
    [HttpGet("my")]
    public Task<MyBallot> My() => _voting.GetMyBallotAsync(_user.RequireUserId());

    /// <summary>Віддати голос за проєкт (+1). Правила перевіряє тригер TR_Vote_CheckRules.</summary>
    [HttpPost("{projectId:int}")]
    public Task<MyBallot> Cast(int projectId) => _voting.CastAsync(_user.RequireUserId(), projectId);
}

/// <summary>Оператор пункту голосування: внесення паперового бюлетеня.</summary>
[ApiController]
[Authorize(Roles = Roles.Operator)]
[Route("api/operator")]
public class OperatorController : ControllerBase
{
    private readonly VotingService _voting;
    private readonly HttpCurrentUser _user;
    private readonly IAuditRepository _audit;

    public OperatorController(VotingService voting, HttpCurrentUser user, IAuditRepository audit)
    {
        _audit = audit;
        _voting = voting;
        _user = user;
    }

    /// <summary>
    /// Пошук виборця за ПІБ і датою народження (ПЦ-14, ДП-08). Разом із даними особи повертається,
    /// чи голосував він уже в поточній кампанії і скільки голосів лишилось (fn_RemainingVotes).
    /// </summary>
    [HttpGet("voters")]
    public async Task<List<VoterStatus>> Voters([FromQuery] string name, [FromQuery] DateOnly? birthDate)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length < 2) return new();
        // доступ до персональних даних фіксується в журналі аудиту (ТЗ ч.1 п.4.6)
        await _audit.WriteAsync(_user.RequireUserId(), "pd_view", "UserAccount", null,
            $"пошук виборця: {name.Trim()}{(birthDate.HasValue ? ", " + birthDate.Value.ToString("dd.MM.yyyy") : "")}");
        return await _voting.FindVotersAsync(name, birthDate);
    }

    [HttpPost("ballots")]
    public async Task<MessageResponse> Ballot(PaperBallotDto dto)
    {
        var count = await _voting.AddPaperBallotAsync(_user.RequireUserId(), dto);
        return new MessageResponse($"Бюлетень внесено: {Words.Votes(count)}.");
    }
}

/// <summary>Адміністратор: кампанії, етапи, переможці, користувачі й ролі, аудит, статистика.</summary>
[ApiController]
[Authorize(Roles = Roles.Admin)]
[Route("api/admin")]
public class AdminController : ControllerBase
{
    private readonly CampaignService _campaigns;
    private readonly IUserRepository _users;
    private readonly IAuditRepository _audit;
    private readonly HttpCurrentUser _user;

    public AdminController(CampaignService campaigns, IUserRepository users, IAuditRepository audit, HttpCurrentUser user)
    {
        _campaigns = campaigns;
        _users = users;
        _audit = audit;
        _user = user;
    }

    [HttpPost("campaigns")]
    public async Task<object> CreateCampaign(CampaignEditDto dto) =>
        new { campaignId = await _campaigns.CreateAsync(dto, _user.RequireUserId()) };

    [HttpPut("campaigns/{id}")]
    public async Task<MessageResponse> UpdateCampaign(short id, CampaignEditDto dto)
    {
        await _campaigns.UpdateAsync(id, dto, _user.RequireUserId());
        return new MessageResponse("Параметри кампанії збережено.");
    }

    /// <summary>Перемкнути етап: draft, submission, review, voting, counting, implementation, closed.</summary>
    [HttpPost("campaigns/{id}/status")]
    public async Task<MessageResponse> SetStatus(short id, CampaignStatusDto dto)
    {
        await _campaigns.SetStatusAsync(id, dto.Status, _user.RequireUserId());
        return new MessageResponse("Етап кампанії змінено.");
    }

    /// <summary>Що станеться при перемиканні етапу: дозволено чи ні, наслідки, попередження.</summary>
    [HttpGet("campaigns/{id}/status-check")]
    public Task<StageTransitionCheck> StatusCheck(short id, [FromQuery] string to) => _campaigns.CheckTransitionAsync(id, to);

    /// <summary>Визначити переможців — usp_SelectWinners (ADO.NET, SqlDataReader).</summary>
    [HttpPost("campaigns/{id}/select-winners")]
    public Task<RatingResponse> SelectWinners(short id) => _campaigns.SelectWinnersAsync(id);

    /// <summary>Рейтинг кампанії з причинами відбору і залишком категорій (fn_CategoryBudgetBalance).</summary>
    [HttpGet("campaigns/{id}/rating")]
    public Task<RatingResponse> Rating(short id) => _campaigns.GetRatingAsync(id);

    [HttpGet("users")]
    public async Task<PagedResult<UserRow>> Users([FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 15)
    {
        await _audit.WriteAsync(_user.RequireUserId(), "pd_view", "UserAccount", null,
            string.IsNullOrWhiteSpace(search) ? $"список користувачів, с. {page}" : $"пошук: {search.Trim()}");
        return await _users.SearchAsync(search, page, pageSize);
    }

    /// <summary>Увімкнути / вимкнути двофакторну автентифікацію (UserAccount.TwoFactorEnabled).</summary>
    [HttpPut("users/{id:int}/two-factor")]
    public async Task<MessageResponse> TwoFactor(int id, UserTwoFactorDto dto)
    {
        var target = await _users.GetByIdAsync(id) ?? throw new KeyNotFoundException("Користувача не знайдено.");
        if (!dto.Enabled && target.UserRoleUsers.Any(r => AuthService.TwoFactorRoles.Contains(r.Role.Code)))
            throw new CivicBudget.DAL.Infrastructure.BusinessRuleException(
                "Для модератора, експерта й адміністратора двофакторна автентифікація обов'язкова.");
        await _users.SetTwoFactorAsync(id, dto.Enabled, _user.RequireUserId());
        return new MessageResponse(dto.Enabled ? "Двофакторну автентифікацію увімкнено." : "Двофакторну автентифікацію вимкнено.");
    }

    [HttpPut("users/{id:int}/roles")]
    public async Task<MessageResponse> SetRoles(int id, UserRolesDto dto)
    {
        await _users.SetRolesAsync(id, dto.Roles, _user.RequireUserId());
        return new MessageResponse("Ролі оновлено.");
    }

    [HttpPut("users/{id:int}/block")]
    public async Task<MessageResponse> Block(int id, UserBlockDto dto)
    {
        if (id == _user.RequireUserId()) throw new CivicBudget.DAL.Infrastructure.BusinessRuleException("Не можна заблокувати самого себе.");
        await _users.SetBlockedAsync(id, dto.IsBlocked, _user.RequireUserId());
        return new MessageResponse(dto.IsBlocked ? "Користувача заблоковано." : "Користувача розблоковано.");
    }

    /// <summary>Журнал аудиту — ADO.NET, SqlDataAdapter + DataTable, OFFSET … FETCH NEXT.</summary>
    [HttpGet("audit")]
    public Task<PagedResult<AuditRow>> Audit([FromQuery] AuditFilter filter) => _audit.GetPageAsync(filter);

    /// <summary>Значення для фільтрів журналу: коди дій і назви об'єктів.</summary>
    [HttpGet("audit/filters")]
    public async Task<object> AuditFilters()
    {
        var (actions, entities) = await _audit.GetFilterValuesAsync();
        return new { actions, entities };
    }

    /// <summary>Зведена статистика (LINQ, синтаксис запитів з join … group … into).</summary>
    [HttpGet("statistics")]
    public Task<StatisticsResponse> Statistics([FromQuery] short? campaignId) => _campaigns.GetStatisticsAsync(campaignId);
}
