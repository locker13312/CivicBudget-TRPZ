using CivicBudget.DAL.Infrastructure;

namespace CivicBudget.Api.Infrastructure;

/// <summary>
/// Перехоплює винятки і повертає JSON {message, code} з українським текстом:
/// порушення правил (у т. ч. SqlException 50001–50020) → 400, немає доступу → 403, не знайдено → 404.
/// </summary>
public class ErrorHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ErrorHandlingMiddleware> _logger;

    public ErrorHandlingMiddleware(RequestDelegate next, ILogger<ErrorHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex) when (!context.Response.HasStarted)
        {
            var (status, message, code) = Map(ex);
            if (status == 500) _logger.LogError(ex, "Необроблена помилка");
            else _logger.LogInformation("{Status}: {Message}", status, message);

            context.Response.StatusCode = status;
            await context.Response.WriteAsJsonAsync(new { message, code });
        }
    }

    private static (int, string, int) Map(Exception ex)
    {
        switch (ex)
        {
            case BusinessRuleException b:
                return (400, b.Message, b.Code);
            case KeyNotFoundException k:
                return (404, k.Message, 0);
            case UnauthorizedAccessException u:
                return (403, string.IsNullOrEmpty(u.Message) || u.Message.StartsWith("Attempted")
                    ? "Недостатньо прав для цієї дії." : u.Message, 0);
        }

        // SqlException, яку не переклали в репозиторії
        var translated = DbErrors.Translate(ex);
        if (translated != null) return (400, translated.Message, translated.Code);

        return (500, "Внутрішня помилка сервера. Спробуйте ще раз.", 0);
    }
}
