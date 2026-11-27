using CivicBudget.Api.Auth;
using CivicBudget.Api.Dto;
using CivicBudget.Api.Services;
using CivicBudget.DAL.Models;
using CivicBudget.DAL.Repositories;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace CivicBudget.Api.Controllers;

/// <summary>Вхід, імітація BankID, оновлення токенів.</summary>
[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AuthService _auth;
    private readonly IUserRepository _users;
    private readonly HttpCurrentUser _currentUser;

    public AuthController(AuthService auth, IUserRepository users, HttpCurrentUser currentUser)
    {
        _auth = auth;
        _users = users;
        _currentUser = currentUser;
    }

    /// <summary>Вхід за e-mail і паролем.</summary>
    [HttpPost("login")]
    [EnableRateLimiting("auth")]
    public Task<LoginResponse> Login(LoginRequest request) => _auth.LoginAsync(request);

    /// <summary>Другий крок входу: одноразовий код із листа (mail-outbox/).</summary>
    [HttpPost("2fa")]
    [EnableRateLimiting("auth")]
    public Task<AuthResponse> TwoFactor(TwoFactorRequest request) => _auth.VerifyTwoFactorAsync(request);

    /// <summary>Надіслати код 2FA ще раз (не частіше, ніж раз на 30 секунд).</summary>
    [HttpPost("2fa/resend")]
    [EnableRateLimiting("auth")]
    public Task<LoginResponse> ResendTwoFactor(TwoFactorResendRequest request) => _auth.ResendTwoFactorAsync(request.ChallengeId);

    /// <summary>Імітація BankID / Дія.Підпис для реєстрації: тестові дані осіб, які «повертає банк».</summary>
    [HttpGet("identity-demo/persons")]
    public IReadOnlyList<DemoIdentityProvider.Person> Persons() => DemoIdentityProvider.Persons;

    /// <summary>Реєстрація мешканця з перевіркою міста й віку.</summary>
    [HttpPost("register")]
    [EnableRateLimiting("auth")]
    public Task<AuthResponse> Register(RegisterRequest request) => _auth.RegisterAsync(request);

    /// <summary>Демо-BankID: список осіб, від імені яких можна «увійти через банк».</summary>
    [HttpGet("bankid-demo/users")]
    public Task<List<UserRow>> BankIdUsers() => _users.GetBankIdDemoUsersAsync();

    /// <summary>Демо-BankID: вхід без пароля від імені обраної особи.</summary>
    [HttpPost("bankid-demo")]
    [EnableRateLimiting("auth")]
    public Task<AuthResponse> BankIdDemo(BankIdDemoRequest request) => _auth.BankIdDemoAsync(request.UserId);

    /// <summary>Нова пара токенів за refresh-токеном (7 днів).</summary>
    [HttpPost("refresh")]
    public Task<AuthResponse> Refresh(RefreshRequest request) => _auth.RefreshAsync(request.RefreshToken);

    [Authorize]
    [HttpGet("me")]
    public Task<UserInfo> Me() => _auth.MeAsync(_currentUser.RequireUserId());
}
