using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class ImplementationStage
{
    public int StageId { get; set; }

    public int ImplementationId { get; set; }

    public byte StageNo { get; set; }

    public string Name { get; set; } = null!;

    public DateOnly PlannedEndDate { get; set; }

    public decimal PlannedCost { get; set; }

    public decimal? ActualCost { get; set; }

    public string Status { get; set; } = null!;

    public DateOnly? CompletedAt { get; set; }

    public virtual Implementation Implementation { get; set; } = null!;

    public virtual ICollection<Report> Reports { get; set; } = new List<Report>();
}
