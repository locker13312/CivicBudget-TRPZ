using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class Contractor
{
    public int ContractorId { get; set; }

    public string Name { get; set; } = null!;

    public string Edrpou { get; set; } = null!;

    public string? Phone { get; set; }

    public string? Email { get; set; }

    public virtual ICollection<Implementation> Implementations { get; set; } = new List<Implementation>();

    public virtual ICollection<UserAccount> UserAccounts { get; set; } = new List<UserAccount>();
}
