using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class UserRole
{
    public int UserId { get; set; }

    public byte RoleId { get; set; }

    public DateTime AssignedAt { get; set; }

    public int? AssignedBy { get; set; }

    public virtual UserAccount? AssignedByNavigation { get; set; }

    public virtual AppRole Role { get; set; } = null!;

    public virtual UserAccount User { get; set; } = null!;
}
