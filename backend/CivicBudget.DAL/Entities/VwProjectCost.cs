using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class VwProjectCost
{
    public int ProjectId { get; set; }

    public short CampaignId { get; set; }

    public decimal EstimatedCost { get; set; }

    public int? ItemCount { get; set; }
}
