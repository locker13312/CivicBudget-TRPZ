using System.Data;
using CivicBudget.DAL.Models;
using CivicBudget.DAL.Repositories;
using Microsoft.Data.SqlClient;

namespace CivicBudget.DAL.Sql;

/// <summary>
/// Функції користувача з db/CivicBudget_v2_extensions.sql — з'єднаний сценарій ADO.NET:
/// скалярна функція читається ExecuteScalar, таблична — SqlDataReader.
/// EF Core під час scaffold функції не генерує, тому виклик — звичайним параметризованим SELECT.
/// </summary>
public class FunctionRepository : IFunctionRepository
{
    private readonly SqlConnectionFactory _factory;

    public FunctionRepository(SqlConnectionFactory factory) => _factory = factory;

    /// <summary>SELECT dbo.fn_RemainingVotes(@VoterId, @CampaignId) — скільки голосів виборець ще може віддати.</summary>
    public async Task<int> GetRemainingVotesAsync(int voterId, short campaignId)
    {
        await using SqlConnection connection = await _factory.OpenAsync();
        await using var command = new SqlCommand("SELECT dbo.fn_RemainingVotes(@VoterId, @CampaignId);", connection);
        command.Parameters.Add("@VoterId", SqlDbType.Int).Value = voterId;
        command.Parameters.Add("@CampaignId", SqlDbType.SmallInt).Value = campaignId;

        object? value = await command.ExecuteScalarAsync();
        return value is int n ? n : 0;
    }

    /// <summary>SELECT … FROM dbo.fn_CategoryBudgetBalance(@CampaignId) — ліміт, використано й залишок кожної категорії.</summary>
    public async Task<List<CategoryBalance>> GetCategoryBalanceAsync(short campaignId)
    {
        const string sql = @"
SELECT CategoryId, CategoryName, BudgetLimit, Used, Balance, Winners
FROM dbo.fn_CategoryBudgetBalance(@CampaignId)
ORDER BY CategoryName;";

        var result = new List<CategoryBalance>();
        await using SqlConnection connection = await _factory.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.Add("@CampaignId", SqlDbType.SmallInt).Value = campaignId;

        await using SqlDataReader reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            result.Add(new CategoryBalance(
                reader.GetByte(0), reader.GetString(1), reader.GetDecimal(2),
                reader.GetDecimal(3), reader.GetDecimal(4), reader.GetInt32(5)));
        return result;
    }

    /// <summary>
    /// Виборці для оператора: пошук за ПІБ і датою народження та стан голосування в кампанії —
    /// спосіб (онлайн / папір) і залишок голосів з fn_RemainingVotes, щоб побачити це ДО внесення бюлетеня.
    /// </summary>
    public async Task<List<VoterStatus>> FindVotersAsync(string name, DateOnly? birthDate, short campaignId)
    {
        const string sql = @"
SELECT TOP (20) u.UserId, u.LastName + N' ' + u.FirstName + ISNULL(N' ' + u.MiddleName, N'') AS FullName,
       u.BirthDate, u.VerificationStatus, u.IsBlocked, d.Name AS DistrictName,
       (SELECT TOP (1) v.Channel FROM Vote v JOIN Project p ON p.ProjectId = v.ProjectId
        WHERE v.VoterId = u.UserId AND p.CampaignId = @CampaignId) AS Channel,
       dbo.fn_RemainingVotes(u.UserId, @CampaignId) AS Remaining
FROM UserAccount u
LEFT JOIN District d ON d.DistrictId = u.DistrictId
WHERE (u.LastName + N' ' + u.FirstName + ISNULL(N' ' + u.MiddleName, N'')) LIKE N'%' + @Name + N'%'
  AND (@BirthDate IS NULL OR u.BirthDate = @BirthDate)
ORDER BY u.LastName, u.FirstName;";

        var result = new List<VoterStatus>();
        await using SqlConnection connection = await _factory.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.Add("@Name", SqlDbType.NVarChar, 150).Value = name.Trim();
        command.Parameters.Add("@BirthDate", SqlDbType.Date).Value =
            birthDate.HasValue ? birthDate.Value.ToDateTime(TimeOnly.MinValue) : DBNull.Value;
        command.Parameters.Add("@CampaignId", SqlDbType.SmallInt).Value = campaignId;

        await using SqlDataReader reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            result.Add(new VoterStatus(
                reader.GetInt32(0), reader.GetString(1),
                reader.IsDBNull(2) ? null : DateOnly.FromDateTime(reader.GetDateTime(2)),
                reader.GetString(3), reader.GetBoolean(4),
                reader.IsDBNull(5) ? null : reader.GetString(5),
                reader.IsDBNull(6) ? null : reader.GetString(6),
                reader.IsDBNull(7) ? 0 : reader.GetInt32(7)));
        return result;
    }
}
