using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class Notification
{
    public long NotificationId { get; set; }

    public int UserId { get; set; }

    public int? ProjectId { get; set; }

    public string NotifType { get; set; } = null!;

    public string Channel { get; set; } = null!;

    public string Body { get; set; } = null!;

    public bool IsRead { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? SentAt { get; set; }

    public virtual Project? Project { get; set; }

    public virtual UserAccount User { get; set; } = null!;
}
