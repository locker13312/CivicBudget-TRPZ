using Microsoft.AspNetCore.SignalR;

namespace CivicBudget.Api.Hubs;

/// <summary>
/// SignalR-хаб оновлення результатів у реальному часі.
/// Сервер надсилає подію "votesChanged" (ProjectId, 0 — оновити все) після кожного голосу.
/// </summary>
public class ResultsHub : Hub
{
}
