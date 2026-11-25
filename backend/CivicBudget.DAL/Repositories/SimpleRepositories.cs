using CivicBudget.DAL.Entities;
using CivicBudget.DAL.Models;
using Microsoft.EntityFrameworkCore;

namespace CivicBudget.DAL.Repositories;

public class ReferenceRepository : IReferenceRepository
{
    private readonly CivicBudgetContext _db;
    public ReferenceRepository(CivicBudgetContext db) => _db = db;

    public Task<List<LookupItem>> GetCategoriesAsync() =>
        _db.Categories.OrderBy(c => c.CategoryId).Select(c => new LookupItem(c.CategoryId, c.Name)).ToListAsync();

    public Task<List<LookupItem>> GetDistrictsAsync() =>
        _db.Districts.OrderBy(d => d.Name).Select(d => new LookupItem(d.DistrictId, d.Name)).ToListAsync();

    public Task<List<LookupItem>> GetPollingStationsAsync() =>
        _db.PollingStations.Where(s => s.IsActive).OrderBy(s => s.StationId)
            .Select(s => new LookupItem(s.StationId, s.Name + " — " + s.Address)).ToListAsync();

    public Task<List<AppRole>> GetRolesAsync() => _db.AppRoles.AsNoTracking().OrderBy(r => r.RoleId).ToListAsync();
}

public class VoteRepository : IVoteRepository
{
    private readonly CivicBudgetContext _db;
    public VoteRepository(CivicBudgetContext db) => _db = db;

    public Task<List<VoteModel>> GetVoterVotesAsync(int voterId, short campaignId) =>
        _db.Votes.AsNoTracking()
            .Where(v => v.VoterId == voterId && v.Project.CampaignId == campaignId)
            .Select(v => new VoteModel(v.ProjectId, v.VoteCount, v.Channel))
            .ToListAsync();

    public Task<Vote?> GetAsync(int voterId, int projectId) =>
        _db.Votes.FirstOrDefaultAsync(v => v.VoterId == voterId && v.ProjectId == projectId);

    public void Add(Vote vote) => _db.Votes.Add(vote);

    public void AddRange(IEnumerable<Vote> votes) => _db.Votes.AddRange(votes);

    /// <summary>
    /// Збереження голосів. Правила (вік, ліміти 2/5, один спосіб голосування) перевіряє
    /// тригер TR_Vote_CheckRules; його THROW 5000x прийде як SqlException усередині DbUpdateException.
    /// </summary>
    public Task SaveAsync() => _db.SaveChangesAsync();
}

public class UserRepository : IUserRepository
{
    private readonly CivicBudgetContext _db;
    public UserRepository(CivicBudgetContext db) => _db = db;

    private static IQueryable<UserRow> ToRows(IQueryable<UserAccount> users) =>
        users.Select(u => new UserRow(
            u.UserId,
            u.LastName + " " + u.FirstName + (u.MiddleName != null ? " " + u.MiddleName : ""),
            u.Email, u.BirthDate, u.VerificationStatus, u.VerificationMethod, u.IsBlocked,
            u.District != null ? u.District.Name : null,
            u.UserRoleUsers.OrderBy(r => r.RoleId).Select(r => r.Role.Code).ToList()));

    public Task<UserAccount?> GetByEmailAsync(string email) =>
        _db.UserAccounts.Include(u => u.UserRoleUsers).ThenInclude(r => r.Role)
            .FirstOrDefaultAsync(u => u.Email == email);

    public Task<UserAccount?> GetByIdAsync(int userId) =>
        _db.UserAccounts.Include(u => u.UserRoleUsers).ThenInclude(r => r.Role)
            .FirstOrDefaultAsync(u => u.UserId == userId);

    public async Task<PagedResult<UserRow>> SearchAsync(string? search, int page, int pageSize)
    {
        var q = _db.UserAccounts.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(u => u.LastName.Contains(s) || u.FirstName.Contains(s) || (u.Email != null && u.Email.Contains(s)));
        }
        var total = await q.CountAsync();
        page = Math.Max(1, page);
        // посторінковий перегляд: Skip/Take → OFFSET … FETCH NEXT
        var items = await ToRows(q.OrderBy(u => u.LastName).ThenBy(u => u.FirstName)
            .Skip((page - 1) * pageSize).Take(pageSize)).ToListAsync();
        return new PagedResult<UserRow>(items, total, page, pageSize);
    }

    /// <summary>Імітація BankID: список осіб з e-mail, які «є в банку».</summary>
    public Task<List<UserRow>> GetBankIdDemoUsersAsync() =>
        ToRows(_db.UserAccounts.AsNoTracking().Where(u => u.Email != null).OrderBy(u => u.UserId)).ToListAsync();

    public Task<List<UserRow>> SearchVotersAsync(string search)
    {
        var s = search.Trim();
        var q = _db.UserAccounts.AsNoTracking()
            .Where(u => u.LastName.Contains(s) || u.FirstName.Contains(s) || (u.Email != null && u.Email.Contains(s)));
        if (int.TryParse(s, out var id))
            q = _db.UserAccounts.AsNoTracking().Where(u => u.UserId == id);
        return ToRows(q.OrderBy(u => u.LastName).ThenBy(u => u.FirstName).Take(20)).ToListAsync();
    }

    public async Task SetRolesAsync(int userId, IReadOnlyCollection<string> roleCodes, int assignedBy)
    {
        var user = await _db.UserAccounts.Include(u => u.UserRoleUsers).FirstAsync(u => u.UserId == userId);
        var roles = await _db.AppRoles.Where(r => roleCodes.Contains(r.Code)).ToListAsync();

        var toRemove = user.UserRoleUsers.Where(ur => roles.All(r => r.RoleId != ur.RoleId)).ToList();
        _db.UserRoles.RemoveRange(toRemove);
        foreach (var role in roles.Where(r => user.UserRoleUsers.All(ur => ur.RoleId != r.RoleId)))
            _db.UserRoles.Add(new UserRole { UserId = userId, RoleId = role.RoleId, AssignedBy = assignedBy });

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = assignedBy,
            ActionCode = "user_roles",
            EntityName = "UserAccount",
            EntityId = userId,
            Details = "ролі: " + string.Join(", ", roles.Select(r => r.Code))
        });
        await _db.SaveChangesAsync();
    }

    public async Task SetTwoFactorAsync(int userId, bool enabled, int byUserId)
    {
        var user = await _db.UserAccounts.FirstAsync(u => u.UserId == userId);
        user.TwoFactorEnabled = enabled;
        _db.AuditLogs.Add(new AuditLog
        {
            UserId = byUserId,
            ActionCode = enabled ? "user_2fa_on" : "user_2fa_off",
            EntityName = "UserAccount",
            EntityId = userId
        });
        await _db.SaveChangesAsync();
    }

    public Task<bool> ExistsAsync(string? email, string? identityHash) =>
        _db.UserAccounts.AnyAsync(u => (email != null && u.Email == email) || (identityHash != null && u.IdentityHash == identityHash));

    public async Task<UserAccount> RegisterAsync(UserAccount user, string roleCode)
    {
        var role = await _db.AppRoles.FirstAsync(r => r.Code == roleCode);
        user.UserRoleUsers.Add(new UserRole { RoleId = role.RoleId, Role = role });
        _db.UserAccounts.Add(user);
        await _db.SaveChangesAsync();
        _db.AuditLogs.Add(new AuditLog
        {
            UserId = user.UserId,
            ActionCode = "register",
            EntityName = "UserAccount",
            EntityId = user.UserId,
            Details = "реєстрація через " + user.VerificationMethod
        });
        await _db.SaveChangesAsync();
        return user;
    }

    public async Task BlockAfterFailedLoginsAsync(int userId, int attempts)
    {
        var user = await _db.UserAccounts.FirstAsync(u => u.UserId == userId);
        user.IsBlocked = true;
        _db.AuditLogs.Add(new AuditLog
        {
            UserId = null,
            ActionCode = "user_autoblock",
            EntityName = "UserAccount",
            EntityId = userId,
            Details = $"{attempts} невдалих спроб входу поспіль"
        });
        await _db.SaveChangesAsync();
    }

    public Task<List<LookupItem>> GetByRoleAsync(string roleCode) =>
        _db.UserAccounts.AsNoTracking()
            .Where(u => !u.IsBlocked && u.UserRoleUsers.Any(r => r.Role.Code == roleCode))
            .OrderBy(u => u.LastName)
            .Select(u => new LookupItem(u.UserId, u.LastName + " " + u.FirstName))
            .ToListAsync();

    public async Task SetBlockedAsync(int userId, bool isBlocked, int byUserId)
    {
        var user = await _db.UserAccounts.FirstAsync(u => u.UserId == userId);
        user.IsBlocked = isBlocked;
        _db.AuditLogs.Add(new AuditLog
        {
            UserId = byUserId,
            ActionCode = isBlocked ? "user_block" : "user_unblock",
            EntityName = "UserAccount",
            EntityId = userId
        });
        await _db.SaveChangesAsync();
    }
}

public class NotificationRepository : INotificationRepository
{
    private readonly CivicBudgetContext _db;
    public NotificationRepository(CivicBudgetContext db) => _db = db;

    public Task<List<NotificationModel>> GetForUserAsync(int userId, int take = 50) =>
        _db.Notifications.AsNoTracking()
            .Where(n => n.UserId == userId)
            .OrderByDescending(n => n.CreatedAt).ThenByDescending(n => n.NotificationId)
            .Take(take)
            .Select(n => new NotificationModel(n.NotificationId, n.ProjectId, n.NotifType, n.Body, n.IsRead, n.CreatedAt))
            .ToListAsync();

    public Task<int> CountUnreadAsync(int userId) => _db.Notifications.CountAsync(n => n.UserId == userId && !n.IsRead);

    public Task MarkReadAsync(int userId, long? notificationId) =>
        _db.Notifications
            .Where(n => n.UserId == userId && !n.IsRead && (notificationId == null || n.NotificationId == notificationId))
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true));

    public Task<bool> IsSubscribedAsync(int userId, int projectId) =>
        _db.Subscriptions.AnyAsync(s => s.UserId == userId && s.ProjectId == projectId);

    public async Task SetSubscriptionAsync(int userId, int projectId, bool subscribe)
    {
        var existing = await _db.Subscriptions.FindAsync(userId, projectId);
        if (subscribe && existing == null)
            _db.Subscriptions.Add(new Subscription { UserId = userId, ProjectId = projectId });
        else if (!subscribe && existing != null)
            _db.Subscriptions.Remove(existing);
        await _db.SaveChangesAsync();
    }

    public Task<List<OutgoingMail>> GetUnsentMailAsync(int take) =>
        _db.Notifications.AsNoTracking()
            .Where(n => n.Channel == "email" && n.SentAt == null)
            .OrderBy(n => n.CreatedAt).ThenBy(n => n.NotificationId)
            .Take(take)
            .Select(n => new OutgoingMail(n.NotificationId, n.User.Email, n.User.LastName + " " + n.User.FirstName, n.Body, n.CreatedAt))
            .ToListAsync();

    public Task MarkSentAsync(IReadOnlyCollection<long> notificationIds) =>
        _db.Notifications.Where(n => notificationIds.Contains(n.NotificationId))
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.SentAt, DateTime.Now));
}
