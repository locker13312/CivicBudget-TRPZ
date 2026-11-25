using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class VwProjectResult
{
    public int ProjectId { get; set; }

    public short CampaignId { get; set; }

    public byte CategoryId { get; set; }

    public string? RegNumber { get; set; }

    public string Title { get; set; } = null!;

    public string Status { get; set; } = null!;

    public decimal EstimatedCost { get; set; }

    public int TotalVotes { get; set; }

    public int OnlineVotes { get; set; }

    public int PaperVotes { get; set; }

    public int? VoterCount { get; set; }
}
