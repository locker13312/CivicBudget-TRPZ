using System.Data;
using CivicBudget.DAL.Infrastructure;
using Microsoft.Data.SqlClient;

namespace CivicBudget.Tests;

/// <summary>
/// Інтеграційні тести правил, які перевіряє сама БД (тригер TR_Vote_CheckRules, процедури usp_SubmitProject і usp_SelectWinners),
/// і їхнього перекладу в повідомлення (DbErrors). Потрібна БД CivicBudget у демо-стані (reset.bat).
/// Кожен тест працює у власній транзакції й відкочує її — дані не змінюються.
/// Запуск без БД: dotnet test --filter Category!=Database
/// </summary>
[Trait("Category", "Database")]
public class DatabaseRulesTests
{
    private static readonly string ConnectionString =
        Environment.GetEnvironmentVariable("CIVICBUDGET_TEST_DB")
        ?? @"Server=.\SQLEXPRESS;Database=CivicBudget;Trusted_Connection=True;TrustServerCertificate=True;";

    // Демо-дані (db/CivicBudget_demo.sql): кампанія 2 на етапі голосування
    private const int Resident = 7;          // ще не голосував
    private const int PaperVoter = 9;        // голосував паперовим бюлетенем
    private const int Teen = 10;             // 15 років
    private const int Published = 7, Published2 = 9, Published3 = 10;
    private const int Draft = 13;

    /// <summary>Виконує дії в транзакції, повертає номер помилки SQL Server (0 — без помилки), завжди відкочує.</summary>
    private static async Task<(int Number, SqlException? Error)> InTransaction(Func<SqlConnection, SqlTransaction, Task> action)
    {
        await using var connection = new SqlConnection(ConnectionString);
        await connection.OpenAsync();
        var tx = connection.BeginTransaction();
        try
        {
            await action(connection, tx);
            return (0, null);
        }
        catch (SqlException ex)
        {
            return (ex.Number, ex);
        }
        finally
        {
            // помилка в тригері вже могла відкотити транзакцію
            if (tx.Connection != null) tx.Rollback();
        }
    }

    private static Task<int> Exec(SqlConnection c, SqlTransaction tx, string sql) =>
        new SqlCommand(sql, c, tx).ExecuteNonQueryAsync();

    private static string OnlineVote(int voter, int project, int count) =>
        $"INSERT INTO Vote (VoterId, ProjectId, VoteCount, Channel) VALUES ({voter}, {project}, {count}, 'online');";

    [Fact]
    public async Task TwoVotesForProject_AreAccepted()
    {
        var (number, _) = await InTransaction((c, tx) => Exec(c, tx, OnlineVote(Resident, Published, 2)));
        Assert.Equal(0, number);
    }

    [Fact]
    public async Task ThirdVoteForProject_Is50003()
    {
        var (number, error) = await InTransaction(async (c, tx) =>
        {
            await Exec(c, tx, OnlineVote(Resident, Published, 2));
            await Exec(c, tx, $"UPDATE Vote SET VoteCount = 3 WHERE VoterId = {Resident} AND ProjectId = {Published};");
        });
        Assert.Equal(50003, number);
        Assert.Equal("За один проєкт можна віддати не більше 2 голосів.", DbErrors.Translate(error!)!.Message);
    }

    [Fact]
    public async Task SixthVoteInCampaign_Is50004()
    {
        var (number, _) = await InTransaction(async (c, tx) =>
        {
            await Exec(c, tx, OnlineVote(Resident, Published, 2));
            await Exec(c, tx, OnlineVote(Resident, Published2, 2));
            await Exec(c, tx, OnlineVote(Resident, Published3, 2));
        });
        Assert.Equal(50004, number);
    }

    [Fact]
    public async Task VoterUnder16_Is50002()
    {
        var (number, _) = await InTransaction((c, tx) => Exec(c, tx, OnlineVote(Teen, Published, 1)));
        Assert.Equal(50002, number);
    }

    [Fact]
    public async Task OnlineAfterPaper_Is50005()
    {
        var (number, _) = await InTransaction((c, tx) => Exec(c, tx, OnlineVote(PaperVoter, Published, 1)));
        Assert.Equal(50005, number);
    }

    [Fact]
    public async Task VoteForUnpublishedProject_Is50001()
    {
        var (number, _) = await InTransaction((c, tx) => Exec(c, tx, OnlineVote(Resident, Draft, 1)));
        Assert.Equal(50001, number);
    }

    [Fact]
    public async Task SubmitDraft_WhenSubmissionClosed_Is50012()
    {
        var (number, error) = await InTransaction(async (c, tx) =>
        {
            var cmd = new SqlCommand("usp_SubmitProject", c, tx) { CommandType = CommandType.StoredProcedure };
            cmd.Parameters.Add("@ProjectId", SqlDbType.Int).Value = Draft;
            await cmd.ExecuteNonQueryAsync();
        });
        Assert.Equal(50012, number);
        Assert.Equal("Прийом проєктів у цій кампанії зараз не триває.", DbErrors.Translate(error!)!.Message);
    }

    [Fact]
    public async Task SelectWinners_BeforeCounting_Is50020()
    {
        var (number, _) = await InTransaction(async (c, tx) =>
        {
            var cmd = new SqlCommand("usp_SelectWinners", c, tx) { CommandType = CommandType.StoredProcedure };
            cmd.Parameters.Add("@CampaignId", SqlDbType.SmallInt).Value = 2;
            await cmd.ExecuteNonQueryAsync();
        });
        Assert.Equal(50020, number);
    }

    [Fact]
    public async Task SelectWinners_RespectsCategoryLimit()
    {
        // «Спорт», ліміт 600 000: №7 (350 000) — перше місце; №8 (300 000) не вміщується в залишок 250 000; №9 (120 000) проходить
        string? skate = null, tennis = null, first = null;
        var (number, _) = await InTransaction(async (c, tx) =>
        {
            await Exec(c, tx, "UPDATE Campaign SET Status = 'counting' WHERE CampaignId = 2;");
            var cmd = new SqlCommand("usp_SelectWinners", c, tx) { CommandType = CommandType.StoredProcedure };
            cmd.Parameters.Add("@CampaignId", SqlDbType.SmallInt).Value = 2;
            await using (var reader = await cmd.ExecuteReaderAsync())
                while (await reader.ReadAsync()) { }

            var statuses = new SqlCommand("SELECT ProjectId, Status FROM Project WHERE ProjectId IN (7, 8, 9);", c, tx);
            await using var r = await statuses.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                var status = r.GetString(1);
                switch (r.GetInt32(0))
                {
                    case 7: first = status; break;
                    case 8: skate = status; break;
                    case 9: tennis = status; break;
                }
            }
        });
        Assert.Equal(0, number);
        Assert.Equal("winner", first);
        Assert.Equal("not_selected", skate);
        Assert.Equal("winner", tennis);
    }
}
