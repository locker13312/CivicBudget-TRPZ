using System.Text;
using System.Text.Json;
using CivicBudget.Api.Auth;
using CivicBudget.Api.Reports;
using CivicBudget.Api.Services;
using CivicBudget.DAL.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CivicBudget.Api.Controllers;

/// <summary>
/// Звіти з експортом у PDF / XLSX / CSV (параметр format). У шапці кожного — назва ІС, кампанія,
/// дата формування і хто сформував.
/// </summary>
[ApiController]
[Route("api/reports")]
public class ReportsController : ControllerBase
{
    private readonly ReportService _reports;
    private readonly HttpCurrentUser _user;

    public ReportsController(ReportService reports, HttpCurrentUser user)
    {
        _reports = reports;
        _user = user;
    }

    private string By => User.Identity?.IsAuthenticated == true ? User.Identity.Name ?? "користувач" : "відвідувач (без входу)";

    private bool IsStaff => User.IsInRole(Roles.Moderator) || User.IsInRole(Roles.Expert) || User.IsInRole(Roles.Admin);

    private FileContentResult Send(ReportDocument doc, string format)
    {
        var file = ReportExporter.Export(doc, format.ToLowerInvariant());
        return File(file.Content, file.ContentType, file.FileName);
    }

    /// <summary>(а) Картка проєкту.</summary>
    [HttpGet("project/{id:int}")]
    public async Task<FileContentResult> Project(int id, [FromQuery] string format = "pdf") =>
        Send(await _reports.ProjectCardAsync(id, _user.UserId, IsStaff, By), format);

    /// <summary>(а) Перелік переможців кампанії.</summary>
    [HttpGet("winners")]
    public async Task<FileContentResult> Winners([FromQuery] short? campaignId, [FromQuery] string format = "pdf") =>
        Send(await _reports.WinnersAsync(campaignId, By), format);

    /// <summary>(а) Хід реалізації: усі картки або одна (implementationId).</summary>
    [HttpGet("implementation")]
    public async Task<FileContentResult> Implementation([FromQuery] int? implementationId, [FromQuery] short? campaignId,
        [FromQuery] string format = "pdf") =>
        Send(await _reports.ImplementationAsync(implementationId, campaignId, By), format);

    /// <summary>(б) Каталог за поточним фільтром; умови фільтра — у шапці звіту.</summary>
    [HttpGet("catalog")]
    public async Task<FileContentResult> Catalog([FromQuery] ProjectFilter filter, [FromQuery] string format = "pdf") =>
        Send(await _reports.CatalogAsync(filter, By), format);

    /// <summary>(в) Результати голосування за кампанією.</summary>
    [HttpGet("results")]
    public async Task<FileContentResult> Results([FromQuery] short? campaignId, [FromQuery] string format = "pdf") =>
        Send(await _reports.ResultsAsync(campaignId, By), format);

    /// <summary>(в) Зведена статистика кампанії — лише адміністратор.</summary>
    [Authorize(Roles = Roles.Admin)]
    [HttpGet("statistics")]
    public async Task<FileContentResult> Statistics([FromQuery] short? campaignId, [FromQuery] string format = "pdf") =>
        Send(await _reports.StatisticsAsync(campaignId, By), format);
}

/// <summary>
/// Відкриті дані: перелік проєктів і результати голосування в машиночитаних форматах JSON і CSV.
/// Без персональних даних (автори не публікуються).
/// </summary>
[ApiController]
[Route("api/open-data")]
public class OpenDataController : ControllerBase
{
    private readonly ProjectService _projects;
    private readonly CampaignService _campaigns;

    public OpenDataController(ProjectService projects, CampaignService campaigns)
    {
        _projects = projects;
        _campaigns = campaigns;
    }

    /// <summary>Перелік наборів даних.</summary>
    [HttpGet]
    public async Task<object> Index()
    {
        var campaigns = await _campaigns.GetAllAsync();
        return new
        {
            publisher = ReportDocument.SystemName,
            license = "CC BY 4.0",
            datasets = new[]
            {
                new { id = "projects", title = "Проєкти громадського бюджету", formats = new[] { "json", "csv" } },
                new { id = "results", title = "Результати голосування", formats = new[] { "json", "csv" } },
            },
            campaigns = campaigns.Select(c => new { c.CampaignId, c.CampaignYear, c.Name, c.Status })
        };
    }

    public record OpenProject(string? RegNumber, short CampaignId, string Title, string Category, string District,
        decimal Cost, int Votes, string Status, string StatusName);

    /// <summary>Проєкти (опубліковані й далі). format = json | csv.</summary>
    [HttpGet("projects")]
    public async Task<IActionResult> Projects([FromQuery] short? campaignId, [FromQuery] string format = "json")
    {
        var filter = new ProjectFilter { CampaignId = campaignId, Page = 1, PageSize = 100, Sort = "title" };
        var rows = new List<OpenProject>();
        PagedResult<ProjectListItem> page;
        do
        {
            page = await _projects.SearchAsync(filter);
            rows.AddRange(page.Items.Select(p => new OpenProject(p.RegNumber, p.CampaignId, p.Title, p.CategoryName, p.DistrictName,
                p.Cost, p.TotalVotes, p.Status, Labels.ProjectStatus(p.Status))));
            filter.Page++;
        } while (rows.Count < page.Total && page.Items.Count > 0);

        return Output(rows, format, "projects",
            new[] { "RegNumber", "CampaignId", "Title", "Category", "District", "Cost", "Votes", "Status", "StatusName" },
            p => new object?[] { p.RegNumber, p.CampaignId, p.Title, p.Category, p.District, p.Cost, p.Votes, p.Status, p.StatusName });
    }

    /// <summary>Результати голосування кампанії (з урахуванням приховування проміжних результатів).</summary>
    [HttpGet("results")]
    public async Task<IActionResult> Results([FromQuery] short? campaignId, [FromQuery] string format = "json")
    {
        var res = await _campaigns.GetResultsAsync(campaignId);
        return Output(res.Rows, format, $"results-{res.Campaign.CampaignYear}",
            new[] { "RegNumber", "Title", "Category", "District", "Cost", "OnlineVotes", "PaperVotes", "TotalVotes", "VoterCount", "Status" },
            r => new object?[] { r.RegNumber, r.Title, r.CategoryName, r.DistrictName, r.Cost, r.OnlineVotes, r.PaperVotes, r.TotalVotes, r.VoterCount, r.Status });
    }

    private IActionResult Output<T>(IReadOnlyList<T> rows, string format, string name, string[] columns, Func<T, object?[]> cells)
    {
        if (format.Equals("csv", StringComparison.OrdinalIgnoreCase))
        {
            // CSV для машинної обробки: роздільник «,», десяткова крапка, UTF-8 з BOM
            var sb = new StringBuilder().AppendLine(string.Join(",", columns));
            foreach (var r in rows)
                sb.AppendLine(string.Join(",", cells(r).Select(c => Csv(Convert.ToString(c, System.Globalization.CultureInfo.InvariantCulture)))));
            var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
            return File(bytes, "text/csv; charset=utf-8", name + ".csv");
        }
        var json = JsonSerializer.SerializeToUtf8Bytes(rows, new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true });
        return File(json, "application/json; charset=utf-8", name + ".json");
    }

    private static string Csv(string? s) =>
        s == null ? "" : s.IndexOfAny(new[] { ',', '"', '\n' }) >= 0 ? "\"" + s.Replace("\"", "\"\"") + "\"" : s;
}
