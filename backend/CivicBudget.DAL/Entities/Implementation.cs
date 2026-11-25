using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class Implementation
{
    public int ImplementationId { get; set; }

    public int ProjectId { get; set; }

    public int ContractorId { get; set; }

    public decimal PlannedBudget { get; set; }

    public DateOnly StartDate { get; set; }

    public DateOnly PlannedEndDate { get; set; }

    public DateOnly? ActualEndDate { get; set; }

    public string Status { get; set; } = null!;

    public int? CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual Contractor Contractor { get; set; } = null!;

    public virtual UserAccount? CreatedByNavigation { get; set; }

    public virtual ICollection<ImplementationStage> ImplementationStages { get; set; } = new List<ImplementationStage>();

    public virtual Project Project { get; set; } = null!;
}
