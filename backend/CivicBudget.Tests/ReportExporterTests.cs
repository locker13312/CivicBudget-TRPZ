using System.Text;
using CivicBudget.Api.Reports;

namespace CivicBudget.Tests;

public class ReportExporterTests
{
    static ReportExporterTests() => QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;

    private static ReportDocument Sample()
    {
        var doc = new ReportDocument { Title = "Каталог проєктів за фільтром", FileName = "catalog", Campaign = "ГБ 2026", GeneratedBy = "тест" };
        doc.Conditions.Add("категорія: Спорт");
        var table = new ReportTable("№", "Назва", "Вартість, грн").Numeric(2);
        table.Add(1, "Скейт-парк; набережна", 300000m);
        table.Totals = new[] { "", "Разом", ReportTable.Format(300000m) };
        doc.Sections.Add(new ReportSection { Table = table });
        return doc;
    }

    [Fact]
    public void Csv_HasBomHeaderConditionsAndEscapedCells()
    {
        var file = ReportExporter.Export(Sample(), "csv");
        var bytes = file.Content;

        Assert.Equal(Encoding.UTF8.GetPreamble(), bytes.Take(3));          // Excel розпізнає кирилицю
        var text = Encoding.UTF8.GetString(bytes);
        Assert.Contains("Умови фільтра: категорія: Спорт", text);         // умови фільтра — у шапці
        Assert.Contains("\"Скейт-парк; набережна\"", text);               // «;» усередині значення екранується
        Assert.EndsWith(".csv", file.FileName);
    }

    [Fact]
    public void Pdf_IsValidPdfDocument()
    {
        var file = ReportExporter.Export(Sample(), "pdf");

        Assert.Equal("%PDF", Encoding.ASCII.GetString(file.Content, 0, 4));
        Assert.Equal("application/pdf", file.ContentType);
    }

    [Fact]
    public void Xlsx_IsZipPackage()
    {
        var file = ReportExporter.Export(Sample(), "xlsx");

        Assert.Equal("PK", Encoding.ASCII.GetString(file.Content, 0, 2));
    }

    [Fact]
    public void UnknownFormat_IsRejected() =>
        Assert.Throws<CivicBudget.DAL.Infrastructure.BusinessRuleException>(() => ReportExporter.Export(Sample(), "docx"));
}
