using System.Text;
using ClosedXML.Excel;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CivicBudget.Api.Reports;

public record ExportedFile(byte[] Content, string ContentType, string FileName);

/// <summary>Експорт звіту в PDF (QuestPDF), XLSX (ClosedXML) і CSV (UTF-8, роздільник «;» — відкривається в Excel).</summary>
public static class ReportExporter
{
    public static readonly string[] Formats = { "pdf", "xlsx", "csv" };

    public static ExportedFile Export(ReportDocument doc, string format) => format switch
    {
        "pdf" => new(Pdf(doc), "application/pdf", doc.FileName + ".pdf"),
        "xlsx" => new(Xlsx(doc), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", doc.FileName + ".xlsx"),
        "csv" => new(Csv(doc), "text/csv; charset=utf-8", doc.FileName + ".csv"),
        _ => throw new CivicBudget.DAL.Infrastructure.BusinessRuleException("Формат: pdf, xlsx або csv.")
    };

    private static IEnumerable<string> HeaderLines(ReportDocument d)
    {
        yield return ReportDocument.SystemName;
        if (d.Campaign != null) yield return "Кампанія: " + d.Campaign;
        yield return $"Сформовано: {d.GeneratedAt:dd.MM.yyyy HH:mm}, {d.GeneratedBy}";
    }

    // ---------- CSV ----------

    private static byte[] Csv(ReportDocument d)
    {
        var sb = new StringBuilder();
        void Line(params string[] cells) => sb.AppendLine(string.Join(";", cells.Select(Escape)));

        Line(d.Title);
        foreach (var h in HeaderLines(d)) Line(h);
        if (d.Conditions.Count > 0) Line("Умови фільтра: " + string.Join("; ", d.Conditions));
        foreach (var s in d.Sections)
        {
            sb.AppendLine();
            if (s.Heading != null) Line(s.Heading);
            foreach (var (label, value) in s.Fields) Line(label, value);
            if (s.Table != null)
            {
                Line(s.Table.Columns);
                foreach (var r in s.Table.Rows) Line(r);
                if (s.Table.Totals != null) Line(s.Table.Totals);
            }
        }
        // BOM — щоб Excel розпізнав кирилицю
        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
    }

    private static string Escape(string s) =>
        s.IndexOfAny(new[] { ';', '"', '\n', '\r' }) >= 0 ? "\"" + s.Replace("\"", "\"\"") + "\"" : s;

    // ---------- XLSX ----------

    private static byte[] Xlsx(ReportDocument d)
    {
        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Звіт");
        int row = 1;
        ws.Cell(row, 1).Value = d.Title;
        ws.Cell(row, 1).Style.Font.SetBold().Font.SetFontSize(14);
        row++;
        foreach (var h in HeaderLines(d)) ws.Cell(row++, 1).Value = h;
        if (d.Conditions.Count > 0) ws.Cell(row++, 1).Value = "Умови фільтра: " + string.Join("; ", d.Conditions);

        foreach (var s in d.Sections)
        {
            row++;
            if (s.Heading != null)
            {
                ws.Cell(row, 1).Value = s.Heading;
                ws.Cell(row++, 1).Style.Font.SetBold().Font.SetFontSize(12);
            }
            foreach (var (label, value) in s.Fields)
            {
                ws.Cell(row, 1).Value = label;
                ws.Cell(row, 1).Style.Font.SetBold();
                ws.Cell(row++, 2).Value = value;
            }
            if (s.Table is { } t)
            {
                for (int c = 0; c < t.Columns.Length; c++)
                {
                    var cell = ws.Cell(row, c + 1);
                    cell.Value = t.Columns[c];
                    cell.Style.Font.SetBold().Fill.SetBackgroundColor(XLColor.FromHtml("#E6EEF7"));
                }
                row++;
                foreach (var r in t.Rows.Concat(t.Totals != null ? new[] { t.Totals } : Array.Empty<string[]>()))
                {
                    for (int c = 0; c < r.Length; c++)
                    {
                        var cell = ws.Cell(row, c + 1);
                        // числа записуємо числами, щоб у Excel можна було рахувати
                        if (t.NumericColumns.Contains(c) && decimal.TryParse(r[c], System.Globalization.NumberStyles.Number, ReportTable.Uk, out var n))
                        {
                            cell.Value = n;
                            cell.Style.NumberFormat.Format = n % 1 == 0 && !r[c].Contains(',') ? "#,##0" : "#,##0.00";
                        }
                        else cell.Value = r[c];
                    }
                    if (r == t.Totals) ws.Row(row).Style.Font.SetBold();
                    row++;
                }
            }
        }
        ws.Columns().AdjustToContents(1, row, 10, 60);
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    // ---------- PDF ----------

    private static byte[] Pdf(ReportDocument d)
    {
        var accent = "#1F5C99";
        return Document.Create(container => container.Page(page =>
        {
            page.Size(PageSizes.A4.Landscape());
            page.Margin(28);
            page.DefaultTextStyle(x => x.FontFamily("Arial").FontSize(9));

            page.Header().Column(col =>
            {
                col.Item().Row(r =>
                {
                    r.RelativeItem().Text(ReportDocument.SystemName).FontColor(accent).SemiBold();
                    r.RelativeItem().AlignRight().Text($"Сформовано: {d.GeneratedAt:dd.MM.yyyy HH:mm}").FontColor(Colors.Grey.Darken1);
                });
                col.Item().PaddingTop(4).Text(d.Title).FontSize(15).Bold();
                if (d.Campaign != null) col.Item().Text("Кампанія: " + d.Campaign);
                col.Item().Text("Сформував: " + d.GeneratedBy).FontColor(Colors.Grey.Darken2);
                if (d.Conditions.Count > 0)
                    col.Item().PaddingTop(2).Text("Умови фільтра: " + string.Join("; ", d.Conditions)).Italic();
                col.Item().PaddingTop(6).LineHorizontal(1).LineColor(accent);
            });

            page.Content().PaddingTop(8).Column(col =>
            {
                col.Spacing(10);
                foreach (var s in d.Sections)
                {
                    col.Item().Column(sec =>
                    {
                        if (s.Heading != null) sec.Item().PaddingBottom(4).Text(s.Heading).FontSize(11).SemiBold().FontColor(accent);
                        foreach (var (label, value) in s.Fields)
                            sec.Item().Text(t =>
                            {
                                t.Span(label + ": ").SemiBold();
                                t.Span(value);
                            });
                        if (s.Table is { } table) sec.Item().Element(e => Table(e, table));
                    });
                }
            });

            page.Footer().AlignRight().Text(t =>
            {
                t.Span("Сторінка ");
                t.CurrentPageNumber();
                t.Span(" з ");
                t.TotalPages();
            });
        })).GeneratePdf();
    }

    private static void Table(IContainer container, ReportTable t)
    {
        container.Table(table =>
        {
            table.ColumnsDefinition(cols =>
            {
                for (int i = 0; i < t.Columns.Length; i++)
                {
                    var name = t.Columns[i];
                    if (t.NumericColumns.Contains(i) || name.Length <= 3) cols.ConstantColumn(Math.Max(42, 7 * name.Length));
                    else if (name == "Номер") cols.ConstantColumn(80);
                    else cols.RelativeColumn(name.StartsWith("Назва") || name is "Проєкт" or "Етап" or "Коментар" or "Звіт виконавця" ? 4 : 2);
                }
            });
            table.Header(h =>
            {
                for (int i = 0; i < t.Columns.Length; i++)
                    h.Cell().Background("#E6EEF7").Padding(3).Text(t.Columns[i]).SemiBold();
            });
            var rows = t.Rows.Concat(t.Totals != null ? new[] { t.Totals } : Array.Empty<string[]>());
            foreach (var r in rows)
            {
                bool total = r == t.Totals;
                for (int i = 0; i < t.Columns.Length; i++)
                {
                    var cell = table.Cell().BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(3);
                    var text = i < r.Length ? r[i] : "";
                    var target = t.NumericColumns.Contains(i) ? cell.AlignRight() : cell;
                    var span = target.Text(text);
                    if (total) span.Bold();
                }
            }
        });
    }
}
