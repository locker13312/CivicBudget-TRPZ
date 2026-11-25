using CivicBudget.DAL.Infrastructure;
using Microsoft.Data.SqlClient;

namespace CivicBudget.DAL.Sql;

/// <summary>
/// Фабрика з'єднань для ADO.NET. Після відкриття SqlConnection кладе в SESSION_CONTEXT
/// користувача та IP — так само, як SessionContextInterceptor для EF Core.
/// </summary>
public class SqlConnectionFactory
{
    private readonly string _connectionString;
    private readonly ICurrentUser _currentUser;

    public SqlConnectionFactory(string connectionString, ICurrentUser currentUser)
    {
        _connectionString = connectionString;
        _currentUser = currentUser;
    }

    public async Task<SqlConnection> OpenAsync()
    {
        var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var cmd = SessionContext.CreateCommand(connection, _currentUser);
        await cmd.ExecuteNonQueryAsync();
        return connection;
    }
}
