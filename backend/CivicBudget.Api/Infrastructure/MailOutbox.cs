using System.Text;
using CivicBudget.DAL.Repositories;

namespace CivicBudget.Api.Infrastructure;

/// <summary>
/// Імітація e-mail (справжнього SMTP у курсовій немає): кожен лист записується файлом .eml
/// у папку mail-outbox/ поруч із застосунком. Файл відкривається поштовим клієнтом або блокнотом.
/// </summary>
public class MailOutbox
{
    private readonly string _folder;
    private readonly ILogger<MailOutbox> _logger;

    public MailOutbox(IConfiguration config, IWebHostEnvironment env, ILogger<MailOutbox> logger)
    {
        _folder = Path.Combine(env.ContentRootPath, config["Storage:MailOutbox"] ?? "mail-outbox");
        Directory.CreateDirectory(_folder);
        _logger = logger;
    }

    public string Folder => _folder;

    public async Task<string> SendAsync(string? to, string toName, string subject, string body)
    {
        var now = DateTime.Now;
        var safeTo = string.Concat((to ?? "no-email").Where(c => char.IsLetterOrDigit(c) || c is '@' or '.' or '-'));
        var path = Path.Combine(_folder, $"{now:yyyyMMdd-HHmmss-fff}_{safeTo}.eml");

        var eml = new StringBuilder()
            .AppendLine("From: Громадський бюджет <no-reply@civicbudget.test>")
            .AppendLine($"To: {toName} <{to}>")
            .AppendLine($"Subject: =?utf-8?B?{Convert.ToBase64String(Encoding.UTF8.GetBytes(subject))}?=")
            .AppendLine($"Date: {now:R}")
            .AppendLine("MIME-Version: 1.0")
            .AppendLine("Content-Type: text/plain; charset=utf-8")
            .AppendLine()
            .AppendLine($"Шановний(-а) {toName}!")
            .AppendLine()
            .AppendLine(body)
            .AppendLine()
            .AppendLine("--")
            .AppendLine("ІС «Громадський бюджет». Лист сформовано автоматично, відповідати на нього не потрібно.");

        await File.WriteAllTextAsync(path, eml.ToString(), new UTF8Encoding(false));
        _logger.LogInformation("Лист для {To} записано в {Path}", to, path);
        return path;
    }
}

/// <summary>
/// Фонова служба: раз на 10 с бере сповіщення з каналом email, які ще не надіслано (SentAt IS NULL),
/// «надсилає» їх через MailOutbox і ставить SentAt. Сповіщення створює тригер TR_Project_StatusChange.
/// </summary>
public class NotificationMailer : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly MailOutbox _outbox;
    private readonly ILogger<NotificationMailer> _logger;

    public NotificationMailer(IServiceScopeFactory scopes, MailOutbox outbox, ILogger<NotificationMailer> logger)
    {
        _scopes = scopes;
        _outbox = outbox;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopes.CreateScope();
                var repo = scope.ServiceProvider.GetRequiredService<INotificationRepository>();
                var mails = await repo.GetUnsentMailAsync(50);
                foreach (var m in mails)
                    await _outbox.SendAsync(m.Email, m.FullName, "Громадський бюджет: сповіщення", m.Body);
                if (mails.Count > 0)
                    await repo.MarkSentAsync(mails.Select(m => m.NotificationId).ToList());
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Не вдалося обробити чергу листів");
            }
            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        }
    }
}
