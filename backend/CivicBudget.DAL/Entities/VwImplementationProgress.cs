using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class VwImplementationProgress
{
    public int ImplementationId { get; set; }

    public int ProjectId { get; set; }

    public int ContractorId { get; set; }

    public string Status { get; set; } = null!;

    public decimal PlannedBudget { get; set; }

    public decimal ActualCost { get; set; }

    public int? StagesTotal { get; set; }

    public int StagesDone { get; set; }
}
