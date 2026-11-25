using CivicBudget.Api.Auth;
using CivicBudget.Api.Dto;
using CivicBudget.Api.Infrastructure;
using CivicBudget.Api.Services;
using CivicBudget.DAL.Models;
using CivicBudget.DAL.Repositories;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CivicBudget.Api.Controllers;

/// <summary>Завантаження вкладень. Публічні — фото опублікованих проєктів і прийнятих звітів; решта — власнику й працівникам.</summary>
[ApiController]
[Route("api/files")]
public class FilesController : ControllerBase
{
    private readonly IAttachmentRepository _attachments;
    private readonly FileStorage _files;
    private readonly HttpCurrentUser _user;

    public FilesController(IAttachmentRepository attachments, FileStorage files, HttpCurrentUser user)
    {
        _attachments = attachments;
        _files = files;
        _user = user;
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var f = await _attachments.GetAsync(id) ?? throw new KeyNotFoundException("Файл не знайдено.");
        bool staff = User.IsInRole(Roles.Moderator) || User.IsInRole(Roles.Expert) || User.IsInRole(Roles.Admin);
        bool allowed = f.ProjectId != null
            ? ProjectService.PublicStatuses.Contains(f.ProjectStatus) || staff || f.ProjectAuthorId == _user.UserId
            : f.ReportStatus == "accepted" || User.IsInRole(Roles.Admin) || User.IsInRole(Roles.Executor);
        if (!allowed) throw new KeyNotFoundException("Файл не знайдено.");

        var stream = _files.Open(f.StorageKey) ?? throw new KeyNotFoundException("Файл відсутній у сховищі.");
        Response.Headers.CacheControl = "private, max-age=600";
        // ?download — зберегти файл з оригінальною назвою; інакше показати в браузері (фото, PDF)
        return Request.Query.ContainsKey("download") ? File(stream, f.MimeType, f.FileName) : File(stream, f.MimeType);
    }
}

/// <summary>Публічна сторінка «Хід реалізації»: план/факт, етапи, прийняті звіти з фото.</summary>
[ApiController]
[Route("api/implementations")]
public class ImplementationsController : ControllerBase
{
    private readonly ImplementationService _impl;
    public ImplementationsController(ImplementationService impl) => _impl = impl;

    [HttpGet]
    public Task<List<ImplementationListItem>> List([FromQuery] short? campaignId) => _impl.GetPublicListAsync(campaignId);

    [HttpGet("{id:int}")]
    public Task<ImplementationDetails> Get(int id) => _impl.GetPublicDetailsAsync(id);
}

/// <summary>Кабінет виконавця: картки свого підрядника, статус етапів, звіти з фото.</summary>
[ApiController]
[Authorize(Roles = Roles.Executor)]
[Route("api/executor")]
public class ExecutorController : ControllerBase
{
    private readonly ImplementationService _impl;
    private readonly HttpCurrentUser _user;

    public ExecutorController(ImplementationService impl, HttpCurrentUser user)
    {
        _impl = impl;
        _user = user;
    }

    [HttpGet("implementations")]
    public Task<List<ImplementationListItem>> List() => _impl.GetExecutorListAsync(_user.RequireUserId());

    [HttpGet("implementations/{id:int}")]
    public Task<ImplementationDetails> Get(int id) => _impl.GetExecutorDetailsAsync(id, _user.RequireUserId());

    [HttpPut("stages/{stageId:int}")]
    public async Task<MessageResponse> UpdateStage(int stageId, StageUpdateDto dto)
    {
        await _impl.UpdateStageAsync(stageId, _user.RequireUserId(), dto);
        return new MessageResponse("Етап оновлено.");
    }

    /// <summary>Звіт про етап: текст + до 10 фото/PDF (multipart/form-data).</summary>
    [HttpPost("stages/{stageId:int}/reports")]
    [RequestSizeLimit(100 * 1024 * 1024)]
    public async Task<object> AddReport(int stageId, [FromForm] string body, [FromForm] List<IFormFile>? files) =>
        new { reportId = await _impl.AddReportAsync(stageId, _user.RequireUserId(), body, files ?? new()) };
}

/// <summary>Адміністратор: картки реалізації, прийняття звітів виконавців.</summary>
[ApiController]
[Authorize(Roles = Roles.Admin)]
[Route("api/admin/implementations")]
public class AdminImplementationsController : ControllerBase
{
    private readonly ImplementationService _impl;
    private readonly IProjectRepository _projects;
    private readonly HttpCurrentUser _user;

    public AdminImplementationsController(ImplementationService impl, IProjectRepository projects, HttpCurrentUser user)
    {
        _impl = impl;
        _projects = projects;
        _user = user;
    }

    [HttpGet]
    public Task<List<ImplementationListItem>> List() => _impl.GetAdminListAsync();

    [HttpGet("{id:int}")]
    public Task<ImplementationDetails> Get(int id) => _impl.GetAdminDetailsAsync(id);

    /// <summary>Дані для форми нової картки: переможці без реалізації і підрядники.</summary>
    [HttpGet("new")]
    public async Task<object> NewForm() => new
    {
        winners = await _projects.GetByStatusesAsync(new[] { "winner" }),
        contractors = await _impl.GetContractorsAsync()
    };

    [HttpPost]
    public async Task<object> Create(ImplementationCreateDto dto) =>
        new { implementationId = await _impl.CreateAsync(dto, _user.RequireUserId()) };

    [HttpPost("{id:int}/status")]
    public async Task<MessageResponse> SetStatus(int id, ImplementationStatusDto dto)
    {
        await _impl.SetStatusAsync(id, dto.Status, _user.RequireUserId());
        return new MessageResponse("Статус реалізації змінено.");
    }

    [HttpGet("reports/pending")]
    public Task<List<PendingReport>> Pending() => _impl.GetPendingReportsAsync();

    /// <summary>Прийняти (accepted) або відхилити (rejected, з коментарем) звіт виконавця.</summary>
    [HttpPost("reports/{reportId:int}/review")]
    public async Task<MessageResponse> Review(int reportId, ReportReviewDto dto)
    {
        await _impl.ReviewReportAsync(reportId, _user.RequireUserId(), dto);
        return new MessageResponse(dto.Decision == "accepted" ? "Звіт прийнято." : "Звіт повернуто виконавцю.");
    }
}
