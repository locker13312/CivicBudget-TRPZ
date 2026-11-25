using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class Attachment
{
    public int AttachmentId { get; set; }

    public int? ProjectId { get; set; }

    public int? ReportId { get; set; }

    public string FileName { get; set; } = null!;

    public string MimeType { get; set; } = null!;

    public string StorageKey { get; set; } = null!;

    public int SizeBytes { get; set; }

    public int UploadedBy { get; set; }

    public DateTime UploadedAt { get; set; }

    public virtual Project? Project { get; set; }

    public virtual Report? Report { get; set; }

    public virtual UserAccount UploadedByNavigation { get; set; } = null!;
}
