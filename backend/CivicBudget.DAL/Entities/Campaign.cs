using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class Campaign
{
    public short CampaignId { get; set; }

    public short CampaignYear { get; set; }

    public string Name { get; set; } = null!;

    public decimal TotalBudget { get; set; }

    public decimal MinProjectCost { get; set; }

    public decimal MaxProjectCost { get; set; }

    public byte VotesPerVoter { get; set; }

    public byte MaxVotesPerProject { get; set; }

    public byte MaxProjectsPerAuthor { get; set; }

    public byte MinVoterAge { get; set; }

    public DateOnly SubmissionStart { get; set; }

    public DateOnly SubmissionEnd { get; set; }

    public DateOnly ReviewEnd { get; set; }

    public DateOnly VotingStart { get; set; }

    public DateOnly VotingEnd { get; set; }

    public DateOnly ResultsDate { get; set; }

    public bool ShowInterimResults { get; set; }

    public string Status { get; set; } = null!;

    public int? CreatedBy { get; set; }

    public virtual ICollection<CampaignCategory> CampaignCategories { get; set; } = new List<CampaignCategory>();

    public virtual UserAccount? CreatedByNavigation { get; set; }
}
