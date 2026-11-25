using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using CivicBudget.Api.Auth;
using CivicBudget.Api.Dto;
using CivicBudget.Api.Infrastructure;
using CivicBudget.DAL.Entities;
using CivicBudget.DAL.Infrastructure;
using CivicBudget.DAL.Repositories;
using Microsoft.Extensions.Caching.Memory;

namespace CivicBudget.Api.Services;

/// <summary>
/// Вхід за e-mail і паролем (BCrypt), блокування після 5 невдалих спроб, двофакторна автентифікація
/// для модератора, експерта й адміністратора (код «надсилається» листом у mail-outbox/),
/// реєстрація та вхід через імітацію BankID / Дія.Підпис, оновлення токенів.
/// </summary>
public class AuthService
{
    public const int MaxFailedAttempts = 5;
    private static readonly string[] TwoFactorRoles = { Roles.Moderator, Roles.Expert, Roles.Admin };

    /// <summary>Лічильник невдалих спроб — у пам'яті (окремої колонки в схемі немає).</summary>
    private static readonly ConcurrentDictionary<int, int> FailedAttempts = new();

    private readonly IUserRepository _users;
    private readonly IAuditRepository _audit;
    private readonly JwtTokenService _tokens;
    private readonly HttpCurrentUser _currentUser;
    private readonly IMemoryCache _cache;
    private readonly MailOutbox _mail;
    private readonly IWebHostEnvironment _env;

    public AuthService(IUserRepository users, IAuditRepository audit, JwtTokenService tokens, HttpCurrentUser currentUser,
        IMemoryCache cache, MailOutbox mail, IWebHostEnvironment env)
    {
        _env = env;
        _users = users;
        _audit = audit;
        _tokens = tokens;
        _currentUser = currentUser;
        _cache = cache;
        _mail = mail;
    }

    // ---------- вхід за паролем ----------

    public async Task<LoginResponse> LoginAsync(LoginRequest request)
    {
        var user = await _users.GetByEmailAsync(request.Email.Trim());
        if (user == null || user.PasswordHash == null)
            throw new BusinessRuleException("Невірний e-mail або пароль.");
        if (user.IsBlocked)
            throw new BusinessRuleException("Обліковий запис заблоковано. Зверніться до адміністратора.");

        // пароль у БД зберігається лише як bcrypt-хеш (char(60))
        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            int attempts = FailedAttempts.AddOrUpdate(user.UserId, 1, (_, n) => n + 1);
            if (attempts >= MaxFailedAttempts)
            {
                FailedAttempts.TryRemove(user.UserId, out _);
                await _users.BlockAfterFailedLoginsAsync(user.UserId, attempts);
                throw new BusinessRuleException(
                    $"Обліковий запис заблоковано після {MaxFailedAttempts} невдалих спроб входу. Зверніться до адміністратора.");
            }
            throw new BusinessRuleException($"Невірний e-mail або пароль. Залишилось спроб: {MaxFailedAttempts - attempts}.");
        }
        FailedAttempts.TryRemove(user.UserId, out _);

        // двофакторна автентифікація: для працівників з увімкненою позначкою TwoFactorEnabled
        if (user.TwoFactorEnabled && user.UserRoleUsers.Any(r => TwoFactorRoles.Contains(r.Role.Code)))
            return await StartTwoFactorAsync(user);

        return LoginResponse.From(await IssueAsync(user, "login"));
    }

    private async Task<LoginResponse> StartTwoFactorAsync(UserAccount user)
    {
        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        var challengeId = Guid.NewGuid().ToString("N");
        _cache.Set("2fa:" + challengeId, new TwoFactorChallenge(user.UserId, code), TimeSpan.FromMinutes(5));

        await _mail.SendAsync(user.Email, $"{user.LastName} {user.FirstName}", "Код підтвердження входу",
            $"Ваш одноразовий код для входу: {code}\nКод дійсний 5 хвилин. Якщо ви не входили — зверніться до адміністратора.");
        _currentUser.Override(user.UserId);
        await _audit.WriteAsync(user.UserId, "login_2fa_sent", "UserAccount", user.UserId, null);

        // лише в режимі Development: підказка, де лежить «лист» (справжньої пошти немає)
        string? hint = _env.IsDevelopment() ? $"Демо-режим: лист із кодом записано файлом у папку {_mail.Folder}" : null;
        return new LoginResponse(true, challengeId, $"Код підтвердження надіслано на {Mask(user.Email)}.",
            null, null, null, null, hint);
    }

    public async Task<AuthResponse> VerifyTwoFactorAsync(TwoFactorRequest request)
    {
        var key = "2fa:" + request.ChallengeId;
        if (!_cache.TryGetValue(key, out TwoFactorChallenge? challenge) || challenge == null)
            throw new BusinessRuleException("Код прострочено. Увійдіть ще раз.");

        if (challenge.Code != request.Code.Trim())
        {
            challenge.Attempts++;
            if (challenge.Attempts >= 3) _cache.Remove(key);
            throw new BusinessRuleException(challenge.Attempts >= 3
                ? "Забагато невірних кодів. Увійдіть ще раз."
                : "Невірний код підтвердження.");
        }
        _cache.Remove(key);

        var user = await _users.GetByIdAsync(challenge.UserId) ?? throw new UnauthorizedAccessException();
        return await IssueAsync(user, "login_2fa");
    }

    private static string Mask(string? email)
    {
        if (string.IsNullOrEmpty(email)) return "вашу пошту";
        var at = email.IndexOf('@');
        return at <= 1 ? email : email[0] + new string('•', at - 1) + email[at..];
    }

    // ---------- імітація BankID / Дія.Підпис ----------

    /// <summary>Вхід «через банк»: особу обирають зі списку, справжньої інтеграції немає.</summary>
    public async Task<AuthResponse> BankIdDemoAsync(int userId)
    {
        var user = await _users.GetByIdAsync(userId)
                   ?? throw new BusinessRuleException("Особу не знайдено.");
        return await IssueAsync(user, "login_bankid");
    }

    /// <summary>
    /// Реєстрація з імітацією BankID / Дія.Підпис: «банк» повертає тестові дані особи (ПІБ, дата народження,
    /// адреса реєстрації, РНОКПП). Перевіряються місто реєстрації і вік — за полями UserAccount
    /// (RegAddress, DistrictId, BirthDate). Особа записується верифікованою з роллю «мешканець».
    /// </summary>
    public async Task<AuthResponse> RegisterAsync(RegisterRequest request)
    {
        if (request.Method is not ("bankid" or "diia"))
            throw new BusinessRuleException("Оберіть спосіб підтвердження: BankID або Дія.Підпис.");
        var person = DemoIdentityProvider.Find(request.PersonId)
                     ?? throw new BusinessRuleException("Банк не повернув даних особи.");

        if (person.DistrictId == null)
            throw new BusinessRuleException(
                $"Адреса реєстрації «{person.RegAddress}» — не в місті Києві. Брати участь у громадському бюджеті можуть лише мешканці міста.");

        int age = DemoIdentityProvider.Age(person.BirthDate);
        if (age < DemoIdentityProvider.MinRegistrationAge)
            throw new BusinessRuleException($"Реєстрація можлива з {DemoIdentityProvider.MinRegistrationAge} років.");

        var email = request.Email.Trim().ToLowerInvariant();
        var identityHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(person.TaxNumber)));
        if (await _users.ExistsAsync(email, identityHash))
            throw new BusinessRuleException("Користувач з таким e-mail або цією особою вже зареєстрований.");

        var now = DateTime.Now;
        var user = await _users.RegisterAsync(new UserAccount
        {
            LastName = person.LastName,
            FirstName = person.FirstName,
            MiddleName = person.MiddleName,
            BirthDate = person.BirthDate,
            IdentityHash = identityHash,          // у БД лише SHA-256 від РНОКПП, не сам номер
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            RegAddress = person.RegAddress,
            DistrictId = person.DistrictId,
            VerificationStatus = "verified",
            VerificationMethod = request.Method,
            VerifiedAt = now,
            RegisteredAt = now,
        }, Roles.Resident);

        var full = await _users.GetByIdAsync(user.UserId) ?? throw new UnauthorizedAccessException();
        return await IssueAsync(full, "login");
    }

    // ---------- токени ----------

    public async Task<AuthResponse> RefreshAsync(string refreshToken)
    {
        var userId = _tokens.ValidateRefresh(refreshToken)
                     ?? throw new UnauthorizedAccessException("Сесія завершилась. Увійдіть знову.");
        var user = await _users.GetByIdAsync(userId) ?? throw new UnauthorizedAccessException();
        if (user.IsBlocked) throw new UnauthorizedAccessException("Обліковий запис заблоковано.");
        return Build(user, _tokens.Issue(user));
    }

    public async Task<UserInfo> MeAsync(int userId)
    {
        var user = await _users.GetByIdAsync(userId) ?? throw new UnauthorizedAccessException();
        return ToInfo(user);
    }

    private async Task<AuthResponse> IssueAsync(UserAccount user, string action)
    {
        if (user.IsBlocked)
            throw new BusinessRuleException("Обліковий запис заблоковано. Зверніться до адміністратора.");

        _currentUser.Override(user.UserId);
        await _audit.WriteAsync(user.UserId, action, "UserAccount", user.UserId, null);
        return Build(user, _tokens.Issue(user));
    }

    private static AuthResponse Build(UserAccount user, TokenPair pair) =>
        new(pair.AccessToken, pair.RefreshToken, pair.AccessExpiresAt, ToInfo(user));

    public static UserInfo ToInfo(UserAccount u) => new(
        u.UserId, $"{u.LastName} {u.FirstName}", u.Email,
        u.UserRoleUsers.OrderBy(r => r.RoleId).Select(r => r.Role.Code).ToList(),
        u.VerificationStatus, u.VerificationMethod, u.BirthDate);

    private class TwoFactorChallenge
    {
        public TwoFactorChallenge(int userId, string code) { UserId = userId; Code = code; }
        public int UserId { get; }
        public string Code { get; }
        public int Attempts { get; set; }
    }
}

/// <summary>
/// Тестовий «банк» для імітації BankID / Дія.Підпис: набір вигаданих осіб.
/// Серед них є мешканець іншого міста і 13-річна особа — щоб показати відмови.
/// </summary>
public static class DemoIdentityProvider
{
    public const int MinRegistrationAge = 14;

    public record Person(int PersonId, string LastName, string FirstName, string MiddleName, DateOnly BirthDate,
        string TaxNumber, string RegAddress, byte? DistrictId, string DistrictName);

    private static DateOnly Today => DateOnly.FromDateTime(DateTime.Today);

    public static IReadOnlyList<Person> Persons => new[]
    {
        new Person(1, "Литвин", "Богдан", "Олександрович", Today.AddYears(-31).AddDays(-40), "3011122233",
            "м. Київ, вул. Січових Стрільців, 14, кв. 7", 10, "Шевченківський"),
        new Person(2, "Мороз", "Катерина", "Василівна", Today.AddYears(-45).AddDays(-100), "3022233344",
            "м. Київ, просп. Оболонський, 22, кв. 81", 5, "Оболонський"),
        new Person(3, "Захарченко", "Ілля", "Петрович", Today.AddYears(-19).AddDays(-12), "3033344455",
            "м. Київ, вул. Борщагівська, 150, кв. 3", 9, "Солом'янський"),
        new Person(4, "Ковальчук", "Остап", "Іванович", Today.AddYears(-15).AddDays(-60), "3044455566",
            "м. Київ, вул. Здолбунівська, 9, кв. 40", 2, "Дарницький"),
        new Person(5, "Гнатюк", "Роман", "Миколайович", Today.AddYears(-38).AddDays(-5), "3055566677",
            "м. Львів, вул. Городоцька, 120, кв. 5", null, "—"),
        new Person(6, "Степаненко", "Аліна", "Юріївна", Today.AddYears(-13).AddDays(-30), "3066677788",
            "м. Київ, вул. Тростянецька, 6, кв. 12", 2, "Дарницький"),
    };

    public static Person? Find(int personId) => Persons.FirstOrDefault(p => p.PersonId == personId);

    public static int Age(DateOnly birth)
    {
        var today = Today;
        int age = today.Year - birth.Year;
        if (birth > today.AddYears(-age)) age--;
        return age;
    }
}
