using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class BudgetItem
{
    public int BudgetItemId { get; set; }

    public int ProjectId { get; set; }

    public string Name { get; set; } = null!;

    public string Unit { get; set; } = null!;

    public decimal Quantity { get; set; }

    public decimal UnitPrice { get; set; }

    public decimal? Amount { get; set; }

    public virtual Project Project { get; set; } = null!;
}
