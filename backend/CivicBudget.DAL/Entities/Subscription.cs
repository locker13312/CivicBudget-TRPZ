using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class Subscription
{
    public int UserId { get; set; }

    public int ProjectId { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual Project Project { get; set; } = null!;

    public virtual UserAccount User { get; set; } = null!;
}
