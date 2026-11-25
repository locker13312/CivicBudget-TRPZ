using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class AppRole
{
    public byte RoleId { get; set; }

    public string Code { get; set; } = null!;

    public string Name { get; set; } = null!;

    public virtual ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>();
}
