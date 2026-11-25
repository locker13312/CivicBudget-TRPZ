using CivicBudget.Api.Services;
using CivicBudget.DAL.Models;
using CivicBudget.DAL.Repositories;

namespace CivicBudget.Api.Reports;

/// <summary>
/// Розділ «Звіти» (методичка, розділ 3):
///  (а) вихідна інформація — картка проєкту, перелік переможців, хід реалізації;
///  (б) результати фільтрації — каталог за поточним фільтром (умови фільтра — у шапці);
///  (в) результати запитів — результати голосування, зведена статистика.
/// Дані беруться через ті самі сервіси й репозиторії, що й сторінки застосунку.
/// </summary>
public class ReportService
{
    private static readonly string[] WinnerStatuses = { "winner", "implementing", "completed" };

    private readonly ProjectService _projects;
    private readonly CampaignService _campaigns;
    private readonly ImplementationService _impl;
    private readonly IProjectRepository _projectRepo;
    private readonly IReferenceRepository _refs;

    public ReportService(ProjectService projects, CampaignService campaigns, ImplementationService impl,
        IProjectRepository projectRepo, IReferenceRepository refs)
    {
        _projects = projects;
        _campaigns = campaigns;
        _impl = impl;
        _projectRepo = projectRepo;
        _refs = refs;
    }

    // ---------- (а) вихідна інформація ----------

    public async Task<ReportDocument> ProjectCardAsync(int projectId, int? userId, bool isStaff, string by)
    {
        var p = await _projects.GetDetailsAsync(projectId, userId, isStaff);
        var doc = new ReportDocument
        {
            Title = $"Картка проєкту {p.RegNumber ?? "(чернетка)"}",
            FileName = $"project-{p.RegNumber ?? p.ProjectId.ToString()}",
            Campaign = p.CampaignName,
            GeneratedBy = by
        };
        var main = new ReportSection { Heading = p.Title };
        main.Fields.AddRange(new[]
        {
            ("Реєстраційний номер", p.RegNumber ?? "—"),
            ("Статус", Labels.ProjectStatus(p.Status)),
            ("Категорія", p.CategoryName),
            ("Район", p.DistrictName),
            ("Адреса", p.Address ?? "—"),
            ("Автор", p.AuthorName),
            ("Подано", ReportTable.Format(p.SubmittedAt)),
            ("Опубліковано", ReportTable.Format(p.PublishedAt)),
            ("Орієнтовна вартість, грн", ReportTable.Format(p.Cost)),
            ("Голоси (онлайн / паперові / усього)", $"{p.OnlineVotes} / {p.PaperVotes} / {p.TotalVotes}"),
            ("Короткий опис", p.Summary ?? "—"),
            ("Опис", p.Description ?? "—"),
        });
        doc.Sections.Add(main);

        var budget = new ReportTable("№", "Позиція кошторису", "Од.", "Кількість", "Ціна, грн", "Сума, грн").Numeric(3, 4, 5);
        int n = 1;
        foreach (var b in p.BudgetItems) budget.Add(n++, b.Name, b.Unit, b.Quantity, b.UnitPrice, b.Amount);
        budget.Totals = new[] { "", "Разом", "", "", "", ReportTable.Format(p.Cost) };
        doc.Sections.Add(new ReportSection { Heading = "Кошторис", Table = budget });

        if (p.Reviews.Count > 0 && isStaff)
        {
            var reviews = new ReportTable("Дата", "Вид розгляду", "Рішення", "Хто", "Коментар");
            foreach (var r in p.Reviews)
                reviews.Add(r.CreatedAt, Labels.ReviewType(r.ReviewType), Labels.Decision(r.Decision), r.ReviewerName, r.Comment);
            doc.Sections.Add(new ReportSection { Heading = "Розгляд (модерація та експертиза)", Table = reviews });
        }
        return doc;
    }

    public async Task<ReportDocument> WinnersAsync(short? campaignId, string by)
    {
        var results = await _campaigns.GetResultsAsync(campaignId);
        var doc = new ReportDocument
        {
            Title = "Перелік проєктів-переможців",
            FileName = $"winners-{results.Campaign.CampaignYear}",
            Campaign = results.Campaign.Name,
            GeneratedBy = by
        };
        var winners = results.Rows.Where(r => WinnerStatuses.Contains(r.Status)).ToList();
        if (winners.Count == 0)
        {
            var empty = new ReportSection();
            empty.Fields.Add(("Примітка", "Переможців ще не визначено (етап кампанії: " + Labels.CampaignStatus(results.Campaign.Status) + ")."));
            doc.Sections.Add(empty);
            return doc;
        }

        var table = new ReportTable("Категорія", "Номер", "Назва проєкту", "Район", "Голоси", "Вартість, грн", "Статус").Numeric(4, 5);
        foreach (var r in winners.OrderBy(r => r.CategoryName).ThenByDescending(r => r.TotalVotes))
            table.Add(r.CategoryName, r.RegNumber, r.Title, r.DistrictName, r.TotalVotes, r.Cost, Labels.ProjectStatus(r.Status));
        table.Totals = new[] { "Разом", $"{winners.Count} проєктів", "", "", ReportTable.Format(winners.Sum(w => w.TotalVotes)),
            ReportTable.Format(winners.Sum(w => w.Cost)), "" };
        doc.Sections.Add(new ReportSection { Table = table });
        return doc;
    }

    public async Task<ReportDocument> ImplementationAsync(int? implementationId, short? campaignId, string by)
    {
        if (implementationId.HasValue)
        {
            var d = await _impl.GetPublicDetailsAsync(implementationId.Value);
            var s = d.Summary;
            var doc1 = new ReportDocument
            {
                Title = $"Хід реалізації проєкту {s.RegNumber}",
                FileName = $"implementation-{s.RegNumber}",
                Campaign = $"Громадський бюджет {s.CampaignYear}",
                GeneratedBy = by
            };
            var info = new ReportSection { Heading = s.Title };
            info.Fields.AddRange(new[]
            {
                ("Підрядник", s.ContractorName),
                ("Статус", Labels.ImplementationStatus(s.Status)),
                ("Строки (план)", $"{ReportTable.Format(s.StartDate)} — {ReportTable.Format(s.PlannedEndDate)}"),
                ("Завершено", ReportTable.Format(s.ActualEndDate)),
                ("Бюджет: план / факт, грн", $"{ReportTable.Format(s.PlannedBudget)} / {ReportTable.Format(s.ActualCost)}"),
                ("Етапів виконано", $"{s.StagesDone} з {s.StagesTotal}"),
            });
            doc1.Sections.Add(info);
            var stages = new ReportTable("№", "Етап", "Строк", "План, грн", "Факт, грн", "Статус", "Звіт виконавця").Numeric(3, 4);
            foreach (var st in d.Stages)
                stages.Add(st.StageNo, st.Name, st.PlannedEndDate, st.PlannedCost, st.ActualCost, Labels.StageStatus(st.Status),
                    st.Reports.FirstOrDefault()?.Body);
            doc1.Sections.Add(new ReportSection { Heading = "Етапи", Table = stages });
            return doc1;
        }

        var list = await _impl.GetPublicListAsync(campaignId);
        var doc = new ReportDocument { Title = "Хід реалізації проєктів", FileName = "implementation", GeneratedBy = by };
        var table = new ReportTable("Рік", "Номер", "Проєкт", "Підрядник", "Статус", "План, грн", "Факт, грн", "Етапи", "Строк").Numeric(5, 6);
        foreach (var i in list)
            table.Add(i.CampaignYear, i.RegNumber, i.Title, i.ContractorName, Labels.ImplementationStatus(i.Status),
                i.PlannedBudget, i.ActualCost, $"{i.StagesDone}/{i.StagesTotal}", i.PlannedEndDate);
        table.Totals = new[] { "Разом", "", $"{list.Count} проєктів", "", "", ReportTable.Format(list.Sum(i => i.PlannedBudget)),
            ReportTable.Format(list.Sum(i => i.ActualCost)), "", "" };
        doc.Sections.Add(new ReportSection { Table = table });
        return doc;
    }

    // ---------- (б) результати фільтрації ----------

    public async Task<ReportDocument> CatalogAsync(ProjectFilter filter, string by)
    {
        filter.Page = 1;
        filter.PageSize = 100;
        var items = new List<ProjectListItem>();
        PagedResult<ProjectListItem> page;
        do
        {
            page = await _projects.SearchAsync(filter);
            items.AddRange(page.Items);
            filter.Page++;
        } while (items.Count < page.Total && page.Items.Count > 0);

        string? campaignName = null;
        if (filter.CampaignId.HasValue) campaignName = (await _campaigns.GetAsync(filter.CampaignId.Value)).Name;

        var doc = new ReportDocument
        {
            Title = "Каталог проєктів за фільтром",
            FileName = "catalog",
            Campaign = campaignName ?? "усі кампанії",
            GeneratedBy = by
        };
        // умови фільтра — у шапці звіту
        if (!string.IsNullOrWhiteSpace(filter.Search)) doc.Conditions.Add($"пошук: «{filter.Search}»");
        if (filter.CategoryId.HasValue)
            doc.Conditions.Add("категорія: " + (await _refs.GetCategoriesAsync()).FirstOrDefault(c => c.Id == filter.CategoryId)?.Name);
        if (filter.DistrictId.HasValue)
            doc.Conditions.Add("район: " + (await _refs.GetDistrictsAsync()).FirstOrDefault(d => d.Id == filter.DistrictId)?.Name);
        if (filter.MinCost.HasValue) doc.Conditions.Add($"вартість від {ReportTable.Format(filter.MinCost)} грн");
        if (filter.MaxCost.HasValue) doc.Conditions.Add($"вартість до {ReportTable.Format(filter.MaxCost)} грн");
        if (!string.IsNullOrWhiteSpace(filter.Status)) doc.Conditions.Add("статус: " + Labels.ProjectStatus(filter.Status));
        if (doc.Conditions.Count == 0) doc.Conditions.Add("без обмежень");

        var table = new ReportTable("№", "Номер", "Назва", "Категорія", "Район", "Вартість, грн", "Голоси", "Статус").Numeric(5, 6);
        int n = 1;
        foreach (var p in items)
            table.Add(n++, p.RegNumber, p.Title, p.CategoryName, p.DistrictName, p.Cost, p.TotalVotes, Labels.ProjectStatus(p.Status));
        table.Totals = new[] { "", "Разом", $"{items.Count} проєктів", "", "", ReportTable.Format(items.Sum(i => i.Cost)),
            ReportTable.Format(items.Sum(i => i.TotalVotes)), "" };
        doc.Sections.Add(new ReportSection { Table = table });
        return doc;
    }

    // ---------- (в) результати запитів ----------

    public async Task<ReportDocument> ResultsAsync(short? campaignId, string by)
    {
        var res = await _campaigns.GetResultsAsync(campaignId);
        var doc = new ReportDocument
        {
            Title = "Результати голосування",
            FileName = $"results-{res.Campaign.CampaignYear}",
            Campaign = res.Campaign.Name,
            GeneratedBy = by
        };
        if (res.VotesHidden)
        {
            var note = new ReportSection();
            note.Fields.Add(("Примітка", "Проміжні результати приховано до завершення голосування (параметр кампанії)."));
            doc.Sections.Add(note);
        }
        foreach (var group in res.Rows.GroupBy(r => r.CategoryName))
        {
            var limit = res.Campaign.Categories.FirstOrDefault(c => c.CategoryName == group.Key)?.BudgetLimit;
            var table = new ReportTable("Місце", "Номер", "Назва", "Район", "Онлайн", "Папір", "Голоси", "Виборців", "Вартість, грн", "Статус")
                .Numeric(4, 5, 6, 7, 8);
            int place = 1;
            foreach (var r in group.OrderByDescending(r => r.TotalVotes).ThenByDescending(r => r.VoterCount))
                table.Add(place++, r.RegNumber, r.Title, r.DistrictName, r.OnlineVotes, r.PaperVotes, r.TotalVotes, r.VoterCount, r.Cost,
                    Labels.ProjectStatus(r.Status));
            doc.Sections.Add(new ReportSection
            {
                Heading = $"{group.Key} (ліміт {ReportTable.Format(limit)} грн)",
                Table = table
            });
        }
        return doc;
    }

    public async Task<ReportDocument> StatisticsAsync(short? campaignId, string by)
    {
        var st = await _campaigns.GetStatisticsAsync(campaignId);
        var doc = new ReportDocument
        {
            Title = "Зведена статистика кампанії",
            FileName = $"statistics-{st.Campaign.CampaignYear}",
            Campaign = st.Campaign.Name,
            GeneratedBy = by
        };
        var s = st.Summary;
        var b = st.BudgetUsage;
        var summary = new ReportSection { Heading = "Учасники, проєкти, голоси, бюджет" };
        summary.Fields.AddRange(new[]
        {
            ("Зареєстровано користувачів (з них верифіковано)", $"{s.Users} ({s.VerifiedUsers})"),
            ("Проєктів у кампанії (з них опубліковано)", $"{s.Projects} ({s.PublishedProjects})"),
            ("Виборців, що проголосували", s.Voters.ToString()),
            ("Голосів: усього / онлайн / паперових", $"{s.Votes} / {s.OnlineVotes} / {s.PaperVotes}"),
            ("Бюджет кампанії, грн", ReportTable.Format(st.Campaign.TotalBudget)),
            ("Вартість проєктів-переможців, грн", ReportTable.Format(b.WinnersCost)),
            ("Карток реалізації (завершено)", $"{b.Implementations} ({b.Completed})"),
            ("Освоєння: план / факт, грн", $"{ReportTable.Format(b.PlannedBudget)} / {ReportTable.Format(b.ActualCost)}"),
        });
        doc.Sections.Add(summary);

        var cat = new ReportTable("Категорія", "Проєктів", "Вартість, грн", "Голоси", "Ліміт, грн").Numeric(1, 2, 3, 4);
        foreach (var c in st.ByCategory) cat.Add(c.CategoryName, c.ProjectCount, c.TotalCost, c.TotalVotes, c.BudgetLimit);
        doc.Sections.Add(new ReportSection { Heading = "За категоріями", Table = cat });

        var dist = new ReportTable("Район", "Проєктів", "Голоси").Numeric(1, 2);
        foreach (var d in st.ByDistrict) dist.Add(d.DistrictName, d.ProjectCount, d.TotalVotes);
        doc.Sections.Add(new ReportSection { Heading = "За районами", Table = dist });

        var status = new ReportTable("Статус проєкту", "Кількість").Numeric(1);
        foreach (var x in st.ByStatus) status.Add(Labels.ProjectStatus(x.Status), x.Count);
        doc.Sections.Add(new ReportSection { Heading = "За статусами", Table = status });
        return doc;
    }
}
