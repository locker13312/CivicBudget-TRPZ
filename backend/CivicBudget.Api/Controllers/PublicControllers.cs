using CivicBudget.Api.Auth;
using CivicBudget.Api.Dto;
using CivicBudget.Api.Services;
using CivicBudget.DAL.Models;
using CivicBudget.DAL.Repositories;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CivicBudget.Api.Controllers;

/// <summary>Довідники: категорії, райони, пункти голосування, ролі.</summary>
[ApiController]
[Route("api/reference")]
public class ReferenceController : ControllerBase
{
    private readonly IReferenceRepository _refs;
    public ReferenceController(IReferenceRepository refs) => _refs = refs;

    [HttpGet]
    public async Task<object> Get() => new
    {
        categories = await _refs.GetCategoriesAsync(),
        districts = await _refs.GetDistrictsAsync(),
        stations = await _refs.GetPollingStationsAsync(),
        roles = (await _refs.GetRolesAsync()).Select(r => new { r.Code, r.Name })
    };
}

/// <summary>Кампанії (публічно) та результати голосування.</summary>
[ApiController]
[Route("api/campaigns")]
public class CampaignsController : ControllerBase
{
    private readonly CampaignService _campaigns;
    public CampaignsController(CampaignService campaigns) => _campaigns = campaigns;

    /// <summary>Поточна кампанія з етапами та лімітами категорій.</summary>
    [HttpGet("current")]
    public async Task<ActionResult<CampaignModel>> Current() =>
        await _campaigns.GetCurrentAsync() is { } c ? c : NotFound(new MessageResponse("Активної кампанії немає."));

    [HttpGet]
    public Task<List<CampaignModel>> All() => _campaigns.GetAllAsync();

    [HttpGet("{id}")]
    public Task<CampaignModel> Get(short id) => _campaigns.GetAsync(id);

    /// <summary>
    /// Підсумковий рейтинг кампанії (після визначення переможців): причина відбору кожного проєкту
    /// і залишок бюджету категорій (fn_CategoryBudgetBalance). Відкрита інформація за ТЗ ч.1 п.3.2.
    /// </summary>
    [HttpGet("{id}/rating")]
    public async Task<RatingResponse> Rating(short id)
    {
        var rating = await _campaigns.GetRatingAsync(id);
        if (!rating.Final) throw new CivicBudget.DAL.Infrastructure.BusinessRuleException("Переможців ще не визначено.");
        return rating;
    }

    /// <summary>Результати голосування (уявлення vw_ProjectResult).</summary>
    [HttpGet("results")]
    public Task<ResultsResponse> Results([FromQuery] short? campaignId) => _campaigns.GetResultsAsync(campaignId);
}

/// <summary>Каталог і картка проєкту, підписка.</summary>
[ApiController]
[Route("api/projects")]
public class ProjectsController : ControllerBase
{
    private readonly ProjectService _projects;
    private readonly INotificationRepository _notifications;
    private readonly HttpCurrentUser _user;

    public ProjectsController(ProjectService projects, INotificationRepository notifications, HttpCurrentUser user)
    {
        _projects = projects;
        _notifications = notifications;
        _user = user;
    }

    /// <summary>Каталог з пошуком, фільтрами (категорія, район, вартість), сортуванням і сторінками.</summary>
    [HttpGet]
    public Task<PagedResult<ProjectListItem>> Search([FromQuery] ProjectFilter filter) => _projects.SearchAsync(filter);

    /// <summary>Проєкти на карті (ті самі фільтри, що й каталог).</summary>
    [HttpGet("map")]
    public Task<List<MapPoint>> Map([FromQuery] ProjectFilter filter) => _projects.GetMapPointsAsync(filter);

    [HttpGet("{id:int}")]
    public Task<ProjectDetails> Get(int id)
    {
        bool staff = User.IsInRole(Roles.Moderator) || User.IsInRole(Roles.Expert) || User.IsInRole(Roles.Admin);
        return _projects.GetDetailsAsync(id, _user.UserId, staff);
    }

    /// <summary>Історія статусів проєкту з журналу аудиту — для автора і працівників.</summary>
    [Authorize]
    [HttpGet("{id:int}/history")]
    public Task<List<StatusHistoryItem>> History(int id)
    {
        bool staff = User.IsInRole(Roles.Moderator) || User.IsInRole(Roles.Expert) || User.IsInRole(Roles.Admin);
        return _projects.GetStatusHistoryAsync(id, _user.RequireUserId(), staff);
    }

    [Authorize]
    [HttpGet("{id:int}/subscription")]
    public async Task<object> IsSubscribed(int id) =>
        new { subscribed = await _notifications.IsSubscribedAsync(_user.RequireUserId(), id) };

    /// <summary>Підписатися на зміни статусу проєкту.</summary>
    [Authorize]
    [HttpPut("{id:int}/subscription")]
    public async Task<object> Subscribe(int id)
    {
        await _notifications.SetSubscriptionAsync(_user.RequireUserId(), id, true);
        return new { subscribed = true };
    }

    [Authorize]
    [HttpDelete("{id:int}/subscription")]
    public async Task<object> Unsubscribe(int id)
    {
        await _notifications.SetSubscriptionAsync(_user.RequireUserId(), id, false);
        return new { subscribed = false };
    }
}

/// <summary>Сповіщення користувача (їх створює тригер TR_Project_StatusChange).</summary>
[ApiController]
[Authorize]
[Route("api/notifications")]
public class NotificationsController : ControllerBase
{
    private readonly INotificationRepository _notifications;
    private readonly HttpCurrentUser _user;

    public NotificationsController(INotificationRepository notifications, HttpCurrentUser user)
    {
        _notifications = notifications;
        _user = user;
    }

    [HttpGet]
    public Task<List<NotificationModel>> Get() => _notifications.GetForUserAsync(_user.RequireUserId());

    [HttpGet("unread-count")]
    public async Task<object> Unread() => new { count = await _notifications.CountUnreadAsync(_user.RequireUserId()) };

    [HttpPost("{id:long}/read")]
    public async Task<IActionResult> Read(long id)
    {
        await _notifications.MarkReadAsync(_user.RequireUserId(), id);
        return NoContent();
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> ReadAll()
    {
        await _notifications.MarkReadAsync(_user.RequireUserId(), null);
        return NoContent();
    }
}
