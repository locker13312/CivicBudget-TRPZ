using System.Data;
using System.Data.Common;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace CivicBudget.DAL.Infrastructure;

/// <summary>
/// Перехоплювач з'єднань EF Core: щойно з'єднання відкрито, кладе в SESSION_CONTEXT
/// ідентифікатор користувача та IP. Тригер TR_Project_StatusChange читає їх
/// через SESSION_CONTEXT(N'UserId') і SESSION_CONTEXT(N'Ip') і пише в журнал аудиту.
/// </summary>
public class SessionContextInterceptor : DbConnectionInterceptor
{
    private readonly ICurrentUser _currentUser;

    public SessionContextInterceptor(ICurrentUser currentUser) => _currentUser = currentUser;

    public override void ConnectionOpened(DbConnection connection, ConnectionEndEventData eventData)
    {
        using var cmd = SessionContext.CreateCommand(connection, _currentUser);
        cmd.ExecuteNonQuery();
    }

    public override async Task ConnectionOpenedAsync(DbConnection connection, ConnectionEndEventData eventData,
        CancellationToken cancellationToken = default)
    {
        await using var cmd = SessionContext.CreateCommand(connection, _currentUser);
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }
}

/// <summary>Спільний для EF і ADO.NET виклик sp_set_session_context.</summary>
public static class SessionContext
{
    public static DbCommand CreateCommand(DbConnection connection, ICurrentUser user)
    {
        var cmd = connection.CreateCommand();
        cmd.CommandText = "EXEC sp_set_session_context @key = N'UserId', @value = @uid; " +
                          "EXEC sp_set_session_context @key = N'Ip', @value = @ip;";
        cmd.Parameters.Add(new SqlParameter("@uid", SqlDbType.Int) { Value = (object?)user.UserId ?? DBNull.Value });
        cmd.Parameters.Add(new SqlParameter("@ip", SqlDbType.VarChar, 45) { Value = (object?)user.Ip ?? DBNull.Value });
        return cmd;
    }
}
