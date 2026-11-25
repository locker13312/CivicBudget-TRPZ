using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class Review
{
    public int ReviewId { get; set; }

    public int ProjectId { get; set; }

    public int ReviewerId { get; set; }

    public string ReviewType { get; set; } = null!;

    public string Decision { get; set; } = null!;

    public string? Comment { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual Project Project { get; set; } = null!;

    public virtual UserAccount Reviewer { get; set; } = null!;
}
