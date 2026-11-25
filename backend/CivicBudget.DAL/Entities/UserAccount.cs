using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class UserAccount
{
    public int UserId { get; set; }

    public string LastName { get; set; } = null!;

    public string FirstName { get; set; } = null!;

    public string? MiddleName { get; set; }

    public DateOnly? BirthDate { get; set; }

    public string? IdentityHash { get; set; }

    public string? Email { get; set; }

    public string? Phone { get; set; }

    public string? PasswordHash { get; set; }

    public string? RegAddress { get; set; }

    public byte? DistrictId { get; set; }

    public int? ContractorId { get; set; }

    public string VerificationStatus { get; set; } = null!;

    public string? VerificationMethod { get; set; }

    public DateTime? VerifiedAt { get; set; }

    public bool TwoFactorEnabled { get; set; }

    public bool IsBlocked { get; set; }

    public DateTime RegisteredAt { get; set; }

    public virtual ICollection<Attachment> Attachments { get; set; } = new List<Attachment>();

    public virtual ICollection<AuditLog> AuditLogs { get; set; } = new List<AuditLog>();

    public virtual ICollection<Campaign> Campaigns { get; set; } = new List<Campaign>();

    public virtual Contractor? Contractor { get; set; }

    public virtual District? District { get; set; }

    public virtual ICollection<Implementation> Implementations { get; set; } = new List<Implementation>();

    public virtual ICollection<Notification> Notifications { get; set; } = new List<Notification>();

    public virtual ICollection<Project> ProjectAuthors { get; set; } = new List<Project>();

    public virtual ICollection<Project> ProjectModerators { get; set; } = new List<Project>();

    public virtual ICollection<Report> ReportAuthors { get; set; } = new List<Report>();

    public virtual ICollection<Report> ReportReviewedByNavigations { get; set; } = new List<Report>();

    public virtual ICollection<Review> Reviews { get; set; } = new List<Review>();

    public virtual ICollection<Subscription> Subscriptions { get; set; } = new List<Subscription>();

    public virtual ICollection<UserRole> UserRoleAssignedByNavigations { get; set; } = new List<UserRole>();

    public virtual ICollection<UserRole> UserRoleUsers { get; set; } = new List<UserRole>();

    public virtual ICollection<Vote> VoteOperators { get; set; } = new List<Vote>();

    public virtual ICollection<Vote> VoteVoters { get; set; } = new List<Vote>();
}
