using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class CampaignCategory
{
    public short CampaignId { get; set; }

    public byte CategoryId { get; set; }

    public decimal BudgetLimit { get; set; }

    public virtual Campaign Campaign { get; set; } = null!;

    public virtual Category Category { get; set; } = null!;

    public virtual ICollection<Project> Projects { get; set; } = new List<Project>();
}
