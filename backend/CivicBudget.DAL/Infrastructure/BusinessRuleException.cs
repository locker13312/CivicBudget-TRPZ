using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace CivicBudget.DAL.Infrastructure;

/// <summary>
/// Порушення бізнес-правила, яке зрозуміло показується користувачу (HTTP 400/409).
/// Code — номер помилки SQL Server (50001–50020 з тригерів і процедур) або 0 для перевірок застосунку.
/// </summary>
public class BusinessRuleException : Exception
{
    public int Code { get; }

    public BusinessRuleException(string message, int code = 0, Exception? inner = null) : base(message, inner)
        => Code = code;
}

/// <summary>
/// Переклад помилок SQL Server у зрозумілі повідомлення.
/// Правила живуть у БД (тригер TR_Vote_CheckRules, процедури usp_SubmitProject і usp_SelectWinners),
/// застосунок їх не дублює, а лише перехоплює SqlException за номером.
/// </summary>
public static class DbErrors
{
    private static readonly Dictionary<int, string> Messages = new()
    {
        // TR_Vote_CheckRules
        [50001] = "Голосування за цей проєкт зараз недоступне: проєкт не опублікований або етап голосування не триває.",
        [50002] = "Ви не можете голосувати: обліковий запис не верифіковано, заблоковано або вам ще немає 16 років.",
        [50003] = "За один проєкт можна віддати не більше 2 голосів.",
        [50004] = "Ви вже використали всі 5 голосів у цій кампанії.",
        [50005] = "Ви вже голосували в цій кампанії іншим способом (онлайн або паперовим бюлетенем). Змішувати способи не можна.",
        // usp_SubmitProject
        [50010] = "Проєкт не знайдено.",
        [50011] = "Подати можна лише чернетку або проєкт, повернутий на доопрацювання.",
        [50012] = "Прийом проєктів у цій кампанії зараз не триває.",
        [50013] = "Заповніть опис проєкту та місце (адресу) реалізації.",
        [50014] = "Вартість проєкту (сума кошторису) виходить за межі, встановлені кампанією.",
        [50015] = "Ви вже подали максимальну кількість проєктів (5) у цій кампанії.",
        // usp_SelectWinners
        [50020] = "Визначити переможців можна лише на етапі «Підрахунок голосів».",
        // обмеження таблиць
        [2627] = "Такий запис уже існує (наприклад, голос за цей проєкт уже віддано).",
        [2601] = "Такий запис уже існує.",
        [547] = "Дані не відповідають обмеженням бази даних.",
    };

    /// <summary>Шукає SqlException у ланцюжку винятків (EF загортає її в DbUpdateException).</summary>
    public static SqlException? FindSqlException(Exception ex)
    {
        for (Exception? e = ex; e != null; e = e.InnerException)
            if (e is SqlException sql) return sql;
        return null;
    }

    /// <summary>Перетворює SqlException на BusinessRuleException, якщо номер відомий; інакше — null.</summary>
    public static BusinessRuleException? Translate(Exception ex)
    {
        var sql = FindSqlException(ex);
        if (sql == null) return null;

        if (Messages.TryGetValue(sql.Number, out var text))
            return new BusinessRuleException(text, sql.Number, ex);

        // інші користувацькі помилки з THROW (50000+) — показуємо текст із БД
        if (sql.Number >= 50000)
            return new BusinessRuleException(sql.Message, sql.Number, ex);

        return null;
    }

    /// <summary>Виконує дію з БД і перекладає відомі помилки SQL Server.</summary>
    public static async Task<T> Run<T>(Func<Task<T>> action)
    {
        try
        {
            return await action();
        }
        catch (Exception ex) when (ex is SqlException or DbUpdateException)
        {
            throw Translate(ex) ?? (Exception)new InvalidOperationException("Помилка бази даних.", ex);
        }
    }

    public static async Task Run(Func<Task> action) => await Run(async () => { await action(); return 0; });
}
