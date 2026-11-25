using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class Category
{
    public byte CategoryId { get; set; }

    public string Name { get; set; } = null!;

    public string? Description { get; set; }

    public virtual ICollection<CampaignCategory> CampaignCategories { get; set; } = new List<CampaignCategory>();
}
