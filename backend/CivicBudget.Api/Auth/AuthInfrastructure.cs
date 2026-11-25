using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using CivicBudget.DAL.Entities;
using CivicBudget.DAL.Infrastructure;
using Microsoft.IdentityModel.Tokens;

namespace CivicBudget.Api.Auth;

/// <summary>Коди ролей — збігаються з AppRole.Code у БД (RBAC через AppRole/UserRole).</summary>
public static class Roles
{
    public const string Resident = "resident";
    public const string Moderator = "moderator";
    public const string Expert = "expert";
    public const string Operator = "operator";
    public const string Executor = "executor";
    public const string Admin = "admin";
}

public class JwtSettings
{
    public string Issuer { get; set; } = "";
    public string Audience { get; set; } = "";
    public string Key { get; set; } = "";
    public int AccessMinutes { get; set; } = 15;
    public int RefreshDays { get; set; } = 7;

    public SymmetricSecurityKey SigningKey => new(Encoding.UTF8.GetBytes(Key));
}

public record TokenPair(string AccessToken, string RefreshToken, DateTime AccessExpiresAt);

/// <summary>
/// Видача JWT: access-токен на 15 хв (з ролями) і refresh-токен на 7 днів.
/// Окремої таблиці для refresh-токенів у схемі БД немає, тому refresh — теж підписаний JWT з typ=refresh.
/// </summary>
public class JwtTokenService
{
    public const string TokenTypeClaim = "typ";
    private readonly JwtSettings _settings;

    public JwtTokenService(JwtSettings settings) => _settings = settings;

    public TokenPair Issue(UserAccount user)
    {
        var now = DateTime.UtcNow;
        var accessExpires = now.AddMinutes(_settings.AccessMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.UserId.ToString()),
            new("name", $"{user.LastName} {user.FirstName}"),
            new(TokenTypeClaim, "access"),
        };
        claims.AddRange(user.UserRoleUsers.Select(ur => new Claim("role", ur.Role.Code)));

        var access = Write(claims, accessExpires);
        var refresh = Write(new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.UserId.ToString()),
            new Claim(TokenTypeClaim, "refresh"),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        }, now.AddDays(_settings.RefreshDays));

        return new TokenPair(access, refresh, accessExpires);
    }

    /// <summary>Перевіряє refresh-токен і повертає UserId або null.</summary>
    public int? ValidateRefresh(string token)
    {
        try
        {
            var handler = new JwtSecurityTokenHandler { MapInboundClaims = false };
            var principal = handler.ValidateToken(token, Parameters(), out _);
            if (principal.FindFirstValue(TokenTypeClaim) != "refresh") return null;
            return int.TryParse(principal.FindFirstValue(JwtRegisteredClaimNames.Sub), out var id) ? id : null;
        }
        catch (SecurityTokenException)
        {
            return null;
        }
        catch (ArgumentException)
        {
            return null;
        }
    }

    public TokenValidationParameters Parameters() => new()
    {
        ValidateIssuer = true,
        ValidIssuer = _settings.Issuer,
        ValidateAudience = true,
        ValidAudience = _settings.Audience,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = _settings.SigningKey,
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromSeconds(30),
        NameClaimType = "name",
        RoleClaimType = "role"
    };

    private string Write(IEnumerable<Claim> claims, DateTime expires)
    {
        var token = new JwtSecurityToken(_settings.Issuer, _settings.Audience, claims,
            notBefore: DateTime.UtcNow, expires: expires,
            signingCredentials: new SigningCredentials(_settings.SigningKey, SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

/// <summary>Поточний користувач із JWT (реалізація ICurrentUser для DAL).</summary>
public class HttpCurrentUser : ICurrentUser
{
    private readonly IHttpContextAccessor _accessor;
    private int? _overrideUserId;

    public HttpCurrentUser(IHttpContextAccessor accessor) => _accessor = accessor;

    public int? UserId
    {
        get
        {
            if (_overrideUserId.HasValue) return _overrideUserId;
            var sub = _accessor.HttpContext?.User.FindFirstValue(JwtRegisteredClaimNames.Sub);
            return int.TryParse(sub, out var id) ? id : null;
        }
    }

    public string? Ip
    {
        get
        {
            var ip = _accessor.HttpContext?.Connection.RemoteIpAddress;
            if (ip == null) return null;
            if (System.Net.IPAddress.IsLoopback(ip)) return "127.0.0.1";
            return ip.IsIPv4MappedToIPv6 ? ip.MapToIPv4().ToString() : ip.ToString();
        }
    }

    /// <summary>Під час входу токена ще немає — підставляємо користувача явно.</summary>
    public void Override(int userId) => _overrideUserId = userId;

    public int RequireUserId() => UserId ?? throw new UnauthorizedAccessException();
}
