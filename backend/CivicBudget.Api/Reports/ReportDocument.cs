namespace CivicBudget.Api.Reports;

/// <summary>
/// Модель звіту, незалежна від формату: шапка (назва ІС, кампанія, дата, хто сформував),
/// умови фільтра (для звітів за фільтром) і розділи — пари «поле: значення» або таблиці.
/// Один і той самий документ експортується в PDF, XLSX і CSV.
/// </summary>
public class ReportDocument
{
    public const string SystemName = "ІС «Громадський бюджет»";

    public string Title { get; init; } = "";
    public string FileName { get; init; } = "report";
    public string? Campaign { get; init; }
    public DateTime GeneratedAt { get; init; } = DateTime.Now;
    public string GeneratedBy { get; init; } = "";
    /// <summary>Умови фільтра, які показуються в шапці («Категорія: Спорт», …).</summary>
    public List<string> Conditions { get; } = new();
    public List<ReportSection> Sections { get; } = new();
}

public class ReportSection
{
    public string? Heading { get; init; }
    public List<(string Label, string Value)> Fields { get; } = new();
    public ReportTable? Table { get; init; }
}

public class ReportTable
{
    public ReportTable(params string[] columns) => Columns = columns;

    public string[] Columns { get; }
    /// <summary>Номери колонок із числами — вирівнювання праворуч.</summary>
    public HashSet<int> NumericColumns { get; } = new();
    public List<string[]> Rows { get; } = new();
    public string[]? Totals { get; set; }

    public ReportTable Numeric(params int[] columns)
    {
        foreach (var c in columns) NumericColumns.Add(c);
        return this;
    }

    public void Add(params object?[] cells) => Rows.Add(cells.Select(Format).ToArray());

    public static string Format(object? v) => v switch
    {
        null => "",
        decimal d => d.ToString("N2", Uk),
        double d => d.ToString("N2", Uk),
        DateTime dt => dt.ToString("dd.MM.yyyy HH:mm", Uk),
        DateOnly d => d.ToString("dd.MM.yyyy", Uk),
        bool b => b ? "так" : "ні",
        _ => v.ToString() ?? ""
    };

    public static readonly System.Globalization.CultureInfo Uk = new("uk-UA");
}
