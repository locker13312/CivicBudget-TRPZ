using System;
using System.Collections.Generic;
using NetTopologySuite.Geometries;

namespace CivicBudget.DAL.Entities;

public partial class Project
{
    public int ProjectId { get; set; }

    public short CampaignId { get; set; }

    public byte CategoryId { get; set; }

    public int AuthorId { get; set; }

    public byte DistrictId { get; set; }

    public int? ModeratorId { get; set; }

    public int? DuplicateOfId { get; set; }

    public string? RegNumber { get; set; }

    public string Title { get; set; } = null!;

    public string? Summary { get; set; }

    public string? Description { get; set; }

    public string? Address { get; set; }

    public Geometry? Location { get; set; }

    public string Status { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public DateTime? SubmittedAt { get; set; }

    public DateTime? PublishedAt { get; set; }

    public virtual ICollection<Attachment> Attachments { get; set; } = new List<Attachment>();

    public virtual UserAccount Author { get; set; } = null!;

    public virtual ICollection<BudgetItem> BudgetItems { get; set; } = new List<BudgetItem>();

    public virtual CampaignCategory CampaignCategory { get; set; } = null!;

    public virtual District District { get; set; } = null!;

    public virtual Project? DuplicateOf { get; set; }

    public virtual Implementation? Implementation { get; set; }

    public virtual ICollection<Project> InverseDuplicateOf { get; set; } = new List<Project>();

    public virtual UserAccount? Moderator { get; set; }

    public virtual ICollection<Notification> Notifications { get; set; } = new List<Notification>();

    public virtual ICollection<Review> Reviews { get; set; } = new List<Review>();

    public virtual ICollection<Subscription> Subscriptions { get; set; } = new List<Subscription>();

    public virtual ICollection<Vote> Votes { get; set; } = new List<Vote>();
}
