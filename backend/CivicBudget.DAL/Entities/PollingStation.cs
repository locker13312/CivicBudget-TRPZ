using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class PollingStation
{
    public short StationId { get; set; }

    public string Name { get; set; } = null!;

    public string Address { get; set; } = null!;

    public byte DistrictId { get; set; }

    public bool IsActive { get; set; }

    public virtual District District { get; set; } = null!;

    public virtual ICollection<Vote> Votes { get; set; } = new List<Vote>();
}
