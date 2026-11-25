using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class AuditLog
{
    public long AuditId { get; set; }

    public int? UserId { get; set; }

    public string ActionCode { get; set; } = null!;

    public string EntityName { get; set; } = null!;

    public long? EntityId { get; set; }

    public string? Details { get; set; }

    public string? IpAddress { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual UserAccount? User { get; set; }
}
