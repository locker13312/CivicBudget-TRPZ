using System.Data;
using CivicBudget.DAL.Infrastructure;
using CivicBudget.DAL.Models;
using CivicBudget.DAL.Repositories;
using Microsoft.Data.SqlClient;

namespace CivicBudget.DAL.Sql;

/// <summary>
/// Виклик збережених процедур через ADO.NET — з'єднаний сценарій:
/// SqlConnection (з'єднання) → SqlCommand з CommandType.StoredProcedure → SqlDataReader (читання результату).
/// Помилки THROW 50010–50020 з процедур перехоплюються як SqlException і перекладаються у зрозумілі повідомлення.
/// </summary>
public class ProcedureRepository : IProcedureRepository
{
    private readonly SqlConnectionFactory _factory;

    public ProcedureRepository(SqlConnectionFactory factory) => _factory = factory;

    /// <summary>Подання проєкту: EXEC usp_SubmitProject @ProjectId. Процедура присвоює номер GB-рік-NNNN.</summary>
    public async Task<SubmitResult> SubmitProjectAsync(int projectId)
    {
        try
        {
            await using SqlConnection connection = await _factory.OpenAsync();

            await using var command = new SqlCommand("usp_SubmitProject", connection)
            {
                CommandType = CommandType.StoredProcedure
            };
            command.Parameters.Add("@ProjectId", SqlDbType.Int).Value = projectId;

            // процедура повертає один рядок: ProjectId, RegNumber, EstimatedCost
            await using SqlDataReader reader = await command.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                throw new BusinessRuleException("Процедура не повернула результат подання.");

            return new SubmitResult(
                reader.GetInt32(reader.GetOrdinal("ProjectId")),
                reader.GetString(reader.GetOrdinal("RegNumber")),
                reader.IsDBNull(reader.GetOrdinal("EstimatedCost")) ? 0 : reader.GetDecimal(reader.GetOrdinal("EstimatedCost")));
        }
        catch (SqlException ex) when (ex.Number is >= 50001 and <= 50020)
        {
            // номер помилки з THROW у процедурі → повідомлення для користувача
            throw DbErrors.Translate(ex)!;
        }
    }

    /// <summary>
    /// Визначення переможців: EXEC usp_SelectWinners @CampaignId.
    /// Процедура вимагає статус кампанії 'counting', змінює статуси проєктів і повертає рейтинг,
    /// який читаємо SqlDataReader-ом рядок за рядком.
    /// </summary>
    public async Task<List<WinnerRow>> SelectWinnersAsync(short campaignId)
    {
        var result = new List<WinnerRow>();
        try
        {
            await using SqlConnection connection = await _factory.OpenAsync();

            await using var command = new SqlCommand("usp_SelectWinners", connection)
            {
                CommandType = CommandType.StoredProcedure,
                CommandTimeout = 120
            };
            command.Parameters.Add(new SqlParameter("@CampaignId", SqlDbType.SmallInt) { Value = campaignId });

            await using SqlDataReader reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                result.Add(new WinnerRow(
                    CategoryId: reader.GetByte(0),
                    Place: reader.GetInt32(1),
                    ProjectId: reader.GetInt32(2),
                    Votes: reader.GetInt32(3),
                    Cost: reader.GetDecimal(4),
                    IsWinner: reader.GetInt32(5) == 1));
            }
        }
        catch (SqlException ex) when (ex.Number is >= 50001 and <= 50020)
        {
            throw DbErrors.Translate(ex)!;
        }
        return result;
    }
}
