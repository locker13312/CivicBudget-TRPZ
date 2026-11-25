namespace CivicBudget.DAL.Infrastructure;

/// <summary>
/// Хто зараз працює із системою. DAL не знає про HTTP: реалізацію дає шар API (з JWT-токена).
/// Потрібно, щоб тригер TR_Project_StatusChange записав у AuditLog користувача та IP.
/// </summary>
public interface ICurrentUser
{
    int? UserId { get; }
    string? Ip { get; }
}
