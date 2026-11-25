namespace CivicBudget.Api.Infrastructure;

/// <summary>
/// Захисні HTTP-заголовки (ТЗ ч.1 п.4.6): заборона вгадування типу вмісту, вбудовування у фрейми,
/// політика безпеки вмісту (CSP). Для Swagger UI CSP м'якша — йому потрібні вбудовані скрипти й стилі.
/// </summary>
public class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;
    public SecurityHeadersMiddleware(RequestDelegate next) => _next = next;

    public Task InvokeAsync(HttpContext context)
    {
        var h = context.Response.Headers;
        h["X-Content-Type-Options"] = "nosniff";
        h["X-Frame-Options"] = "DENY";
        h["Referrer-Policy"] = "no-referrer";
        h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";

        var path = context.Request.Path;
        if (path.StartsWithSegments("/swagger"))
            h["Content-Security-Policy"] =
                "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'";
        else if (!path.StartsWithSegments("/api/files"))
            // JSON API нічого не виконує в браузері
            h["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";
        return _next(context);
    }
}
