using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using CivicBudget.Api.Auth;
using CivicBudget.Api.Hubs;
using CivicBudget.Api.Infrastructure;
using CivicBudget.Api.Reports;
using CivicBudget.Api.Services;
using CivicBudget.DAL;
using CivicBudget.DAL.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.OpenApi.Models;

Console.OutputEncoding = System.Text.Encoding.UTF8;   // кирилиця в логах консолі

var builder = WebApplication.CreateBuilder(args);

// ---------- шар доступу до даних (DAL) ----------
var connectionString = builder.Configuration.GetConnectionString("CivicBudget")
                       ?? throw new InvalidOperationException("Не задано рядок підключення CivicBudget.");
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<HttpCurrentUser>();
builder.Services.AddScoped<ICurrentUser>(sp => sp.GetRequiredService<HttpCurrentUser>());
builder.Services.AddCivicBudgetDal(connectionString);

// ---------- сервіси бізнес-логіки ----------
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<ProjectService>();
builder.Services.AddScoped<VotingService>();
builder.Services.AddScoped<CampaignService>();
builder.Services.AddScoped<ImplementationService>();
builder.Services.AddScoped<ReportService>();

// ---------- файли, імітація пошти, кеш одноразових кодів 2FA ----------
builder.Services.AddSingleton<FileStorage>();
builder.Services.AddSingleton<MailOutbox>();
builder.Services.AddHostedService<NotificationMailer>();
builder.Services.AddMemoryCache();
QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;   // PDF-звіти (безкоштовна ліцензія)

// ---------- обмеження частоти запитів (вбудований RateLimiter) ----------
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = async (ctx, ct) =>
        await ctx.HttpContext.Response.WriteAsJsonAsync(new { message = "Забагато запитів. Зачекайте хвилину й спробуйте знову.", code = 429 }, ct);
    // вхід, 2FA, реєстрація: 10 спроб за хвилину з однієї IP-адреси
    o.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
    // загальне обмеження для API: 600 запитів за хвилину з однієї IP-адреси
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 600, Window = TimeSpan.FromMinutes(1) }));
});

// ---------- JWT ----------
var jwt = builder.Configuration.GetSection("Jwt").Get<JwtSettings>()!;
var tokenService = new JwtTokenService(jwt);
builder.Services.AddSingleton(jwt);
builder.Services.AddSingleton(tokenService);
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = tokenService.Parameters();
        // refresh-токен не можна використовувати як access
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = ctx =>
            {
                if (ctx.Principal?.FindFirst(JwtTokenService.TokenTypeClaim)?.Value != "access")
                    ctx.Fail("Очікується access-токен.");
                return Task.CompletedTask;
            }
        };
    });
builder.Services.AddAuthorization();

// ---------- контролери, валідація з українськими повідомленнями ----------
builder.Services.AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never)
    .ConfigureApiBehaviorOptions(o =>
        o.InvalidModelStateResponseFactory = ctx =>
        {
            var errors = ctx.ModelState.Values.SelectMany(v => v.Errors)
                .Select(e => string.IsNullOrEmpty(e.ErrorMessage) ? "Некоректні дані." : e.ErrorMessage)
                .Distinct().ToList();
            return new BadRequestObjectResult(new { message = string.Join(" ", errors), errors });
        });

builder.Services.AddSignalR();

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? Array.Empty<string>())
     .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

// ---------- Swagger (OpenAPI 3) ----------
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Громадський бюджет — API",
        Version = "v1",
        Description = "REST API ІС обліку, голосування та реалізації проєктів громадського бюджету (курсова ТРПЗ)."
    });
    var xml = Path.Combine(AppContext.BaseDirectory, "CivicBudget.Api.xml");
    if (File.Exists(xml)) c.IncludeXmlComments(xml);
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Description = "Вставте access-токен з /api/auth/login"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<ErrorHandlingMiddleware>();
if (!app.Environment.IsDevelopment()) app.UseHsts();
app.UseHttpsRedirection();
app.UseSwagger();
app.UseSwaggerUI(c => c.DocumentTitle = "Громадський бюджет — API");
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapControllers();
app.MapHub<ResultsHub>("/hubs/results");
app.MapGet("/", () => Results.Redirect("/swagger")).ExcludeFromDescription();

app.Run();
