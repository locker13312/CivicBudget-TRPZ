using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class Report
{
    public int ReportId { get; set; }

    public int StageId { get; set; }

    public int AuthorId { get; set; }

    public string Body { get; set; } = null!;

    public string Status { get; set; } = null!;

    public DateTime SubmittedAt { get; set; }

    public int? ReviewedBy { get; set; }

    public DateTime? ReviewedAt { get; set; }

    public string? ReviewComment { get; set; }

    public virtual ICollection<Attachment> Attachments { get; set; } = new List<Attachment>();

    public virtual UserAccount Author { get; set; } = null!;

    public virtual UserAccount? ReviewedByNavigation { get; set; }

    public virtual ImplementationStage Stage { get; set; } = null!;
}
