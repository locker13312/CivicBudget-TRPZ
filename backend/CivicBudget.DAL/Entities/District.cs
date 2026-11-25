using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class District
{
    public byte DistrictId { get; set; }

    public string Name { get; set; } = null!;

    public virtual ICollection<PollingStation> PollingStations { get; set; } = new List<PollingStation>();

    public virtual ICollection<Project> Projects { get; set; } = new List<Project>();

    public virtual ICollection<UserAccount> UserAccounts { get; set; } = new List<UserAccount>();
}
