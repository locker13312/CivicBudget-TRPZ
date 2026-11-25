using System;
using System.Collections.Generic;

namespace CivicBudget.DAL.Entities;

public partial class Vote
{
    public long VoteId { get; set; }

    public int VoterId { get; set; }

    public int ProjectId { get; set; }

    public byte VoteCount { get; set; }

    public string Channel { get; set; } = null!;

    public short? StationId { get; set; }

    public int? OperatorId { get; set; }

    public DateTime CastAt { get; set; }

    public virtual UserAccount? Operator { get; set; }

    public virtual Project Project { get; set; } = null!;

    public virtual PollingStation? Station { get; set; }

    public virtual UserAccount Voter { get; set; } = null!;
}
