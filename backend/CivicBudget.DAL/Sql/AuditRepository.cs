using System.Data;
using CivicBudget.DAL.Models;
using CivicBudget.DAL.Repositories;
using Microsoft.Data.SqlClient;

namespace CivicBudget.DAL.Sql;

/// <summary>
/// Журнал аудиту — від'єднаний сценарій ADO.NET:
/// SqlDataAdapter заповнює DataSet/DataTable, з'єднання закривається, далі працюємо з даними в пам'яті
/// (DataView для сортування). Посторінковий перегляд — OFFSET … FETCH NEXT у тексті запиту.
/// </summary>
public class AuditRepository : IAuditRepository
{
    private readonly SqlConnectionFactory _factory;

    public AuditRepository(SqlConnectionFactory factory) => _factory = factory;

    public async Task<PagedResult<AuditRow>> GetPageAsync(AuditFilter f)
    {
        int page = Math.Max(1, f.Page);
        int pageSize = Math.Clamp(f.PageSize, 1, 200);

        // Умови фільтра — лише параметри (@From, @To …), жодної конкатенації введених значень у текст SQL.
        const string where = @"
WHERE (@From IS NULL OR a.CreatedAt >= @From)
  AND (@To IS NULL OR a.CreatedAt < DATEADD(day, 1, @To))
  AND (@Action IS NULL OR a.ActionCode = @Action)
  AND (@Entity IS NULL OR a.EntityName = @Entity)
  AND (@User IS NULL OR u.LastName + N' ' + u.FirstName LIKE N'%' + @User + N'%' OR u.Email LIKE '%' + @User + '%')";

        string sql = $@"
SELECT COUNT(*) AS Total
FROM AuditLog a
LEFT JOIN UserAccount u ON u.UserId = a.UserId
{where};

SELECT a.AuditId, a.CreatedAt, u.LastName + N' ' + u.FirstName AS UserName,
       a.ActionCode, a.EntityName, a.EntityId, a.Details, a.IpAddress
FROM AuditLog a
LEFT JOIN UserAccount u ON u.UserId = a.UserId
{where}
ORDER BY a.CreatedAt DESC, a.AuditId DESC
OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY;";

        var dataSet = new DataSet("Audit");

        await using (SqlConnection connection = await _factory.OpenAsync())
        {
            using var command = new SqlCommand(sql, connection);
            command.Parameters.Add("@From", SqlDbType.DateTime2).Value = (object?)f.From?.Date ?? DBNull.Value;
            command.Parameters.Add("@To", SqlDbType.DateTime2).Value = (object?)f.To?.Date ?? DBNull.Value;
            command.Parameters.Add("@Action", SqlDbType.VarChar, 30).Value = Empty(f.Action);
            command.Parameters.Add("@Entity", SqlDbType.VarChar, 50).Value = Empty(f.Entity);
            command.Parameters.Add("@User", SqlDbType.NVarChar, 100).Value = Empty(f.User);
            command.Parameters.Add("@Skip", SqlDbType.Int).Value = (page - 1) * pageSize;
            command.Parameters.Add("@Take", SqlDbType.Int).Value = pageSize;

            // SqlDataAdapter.Fill: дві вибірки → дві таблиці DataSet
            using var adapter = new SqlDataAdapter(command);
            adapter.TableMappings.Add("Table", "Total");
            adapter.TableMappings.Add("Table1", "AuditLog");
            adapter.Fill(dataSet);
        } // з'єднання закрито — далі дані лише в пам'яті

        int total = Convert.ToInt32(dataSet.Tables["Total"]!.Rows[0]["Total"]);
        DataTable table = dataSet.Tables["AuditLog"]!;

        // DataView — представлення DataTable з сортуванням
        var view = new DataView(table) { Sort = "CreatedAt DESC, AuditId DESC" };

        var items = new List<AuditRow>();
        foreach (DataRowView row in view)
        {
            items.Add(new AuditRow(
                (long)row["AuditId"],
                (DateTime)row["CreatedAt"],
                row["UserName"] as string,
                (string)row["ActionCode"],
                (string)row["EntityName"],
                row["EntityId"] == DBNull.Value ? null : (long)row["EntityId"],
                row["Details"] as string,
                row["IpAddress"] as string));
        }
        return new PagedResult<AuditRow>(items, total, page, pageSize);
    }

    private static object Empty(string? s) => string.IsNullOrWhiteSpace(s) ? DBNull.Value : s.Trim();

    /// <summary>Значення для випадних списків фільтра — SqlDataReader (з'єднаний сценарій).</summary>
    public async Task<(List<string> Actions, List<string> Entities)> GetFilterValuesAsync()
    {
        var actions = new List<string>();
        var entities = new List<string>();
        await using SqlConnection connection = await _factory.OpenAsync();
        await using var command = new SqlCommand(
            "SELECT DISTINCT ActionCode FROM AuditLog ORDER BY ActionCode; SELECT DISTINCT EntityName FROM AuditLog ORDER BY EntityName;",
            connection);
        await using SqlDataReader reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync()) actions.Add(reader.GetString(0));
        await reader.NextResultAsync();
        while (await reader.ReadAsync()) entities.Add(reader.GetString(0));
        return (actions, entities);
    }

    /// <summary>Запис події в журнал: параметризований INSERT через SqlCommand.ExecuteNonQuery (з'єднаний сценарій).</summary>
    public async Task WriteAsync(int? userId, string actionCode, string entityName, long? entityId, string? details)
    {
        const string sql = @"
INSERT INTO AuditLog (UserId, ActionCode, EntityName, EntityId, Details, IpAddress)
VALUES (@UserId, @ActionCode, @EntityName, @EntityId, @Details, TRY_CAST(SESSION_CONTEXT(N'Ip') AS varchar(45)));";

        await using SqlConnection connection = await _factory.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.Add("@UserId", SqlDbType.Int).Value = (object?)userId ?? DBNull.Value;
        command.Parameters.Add("@ActionCode", SqlDbType.VarChar, 30).Value = actionCode;
        command.Parameters.Add("@EntityName", SqlDbType.VarChar, 50).Value = entityName;
        command.Parameters.Add("@EntityId", SqlDbType.BigInt).Value = (object?)entityId ?? DBNull.Value;
        command.Parameters.Add("@Details", SqlDbType.NVarChar, 1000).Value = (object?)details ?? DBNull.Value;
        await command.ExecuteNonQueryAsync();
    }
}
