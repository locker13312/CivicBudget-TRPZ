# Показові фрагменти коду

Фрагменти вирізано з робочих файлів (номери рядків — на момент формування). Порядок відповідає шарам: БД → DAL → API → фронтенд.

## 1. Database First: реєстрація DbContext і DAL

`backend/CivicBudget.DAL/DalServiceCollectionExtensions.cs`, рядки 12–36. Модель EF згенеровано з наявної БД командою `Scaffold-DbContext`; тут DbContext підключається до SQL Server, а репозиторії реєструються за інтерфейсами (шаблон DAL).

```csharp
public static IServiceCollection AddCivicBudgetDal(this IServiceCollection services, string connectionString)
{
    services.AddScoped<SessionContextInterceptor>();
    services.AddDbContext<CivicBudgetContext>((sp, options) =>
        options.UseSqlServer(connectionString, sql => sql.UseNetTopologySuite())   // geography (Project.Location) → NetTopologySuite.Point
               .AddInterceptors(sp.GetRequiredService<SessionContextInterceptor>()));

    services.AddScoped(sp => new SqlConnectionFactory(connectionString, sp.GetRequiredService<ICurrentUser>()));

    // EF Core-репозиторії
    services.AddScoped<IReferenceRepository, ReferenceRepository>();
    services.AddScoped<ICampaignRepository, CampaignRepository>();
    services.AddScoped<IProjectRepository, ProjectRepository>();
    services.AddScoped<IVoteRepository, VoteRepository>();
    services.AddScoped<IUserRepository, UserRepository>();
    services.AddScoped<INotificationRepository, NotificationRepository>();
    services.AddScoped<IStatisticsRepository, StatisticsRepository>();
    services.AddScoped<IAttachmentRepository, AttachmentRepository>();
    services.AddScoped<IImplementationRepository, ImplementationRepository>();

    // ADO.NET-репозиторії
    services.AddScoped<IProcedureRepository, ProcedureRepository>();
    services.AddScoped<IFunctionRepository, FunctionRepository>();
    services.AddScoped<IAuditRepository, AuditRepository>();
    return services;
```

## 2. LINQ з лямбда-виразами: фільтри каталогу

`backend/CivicBudget.DAL/Repositories/ProjectRepository.cs`, рядки 122–139. Кожен фільтр додається методом `Where` з лямбдою, лише якщо його задано. Запит виконується на сервері БД.

```csharp
private IQueryable<Row> Filtered(ProjectFilter f, IReadOnlyCollection<string> allowedStatuses)
{
    IQueryable<Project> projects = _db.Projects.AsNoTracking().Where(p => allowedStatuses.Contains(p.Status));
    if (f.CampaignId.HasValue) projects = projects.Where(p => p.CampaignId == f.CampaignId);
    if (f.CategoryId.HasValue) projects = projects.Where(p => p.CategoryId == f.CategoryId);
    if (f.DistrictId.HasValue) projects = projects.Where(p => p.DistrictId == f.DistrictId);
    if (!string.IsNullOrWhiteSpace(f.Status)) projects = projects.Where(p => p.Status == f.Status);
    if (!string.IsNullOrWhiteSpace(f.Search))
    {
        var s = f.Search.Trim();
        projects = projects.Where(p => p.Title.Contains(s)
            || (p.Summary != null && p.Summary.Contains(s))
            || (p.RegNumber != null && p.RegNumber.Contains(s)));
    }
    var rows = WithCostAndVotes(projects);
    if (f.MinCost.HasValue) rows = rows.Where(x => x.Cost >= f.MinCost);
    if (f.MaxCost.HasValue) rows = rows.Where(x => x.Cost <= f.MaxCost);
    return rows;
```

## 3. Сортування і посторінковий перегляд Skip/Take

`backend/CivicBudget.DAL/Repositories/ProjectRepository.cs`, рядки 56–74. `OrderBy/ThenBy` задають порядок, `Skip/Take` EF Core перетворює на `OFFSET … FETCH NEXT`.

```csharp
public async Task<PagedResult<ProjectListItem>> SearchAsync(ProjectFilter f, IReadOnlyCollection<string> allowedStatuses)
{
    var rows = Filtered(f, allowedStatuses);

    rows = f.Sort switch
    {
        "cost" => rows.OrderBy(x => x.Cost).ThenBy(x => x.P.Title),
        "cost_desc" => rows.OrderByDescending(x => x.Cost).ThenBy(x => x.P.Title),
        "new" => rows.OrderByDescending(x => x.P.PublishedAt).ThenByDescending(x => x.P.ProjectId),
        "title" => rows.OrderBy(x => x.P.Title),
        _ => rows.OrderByDescending(x => x.Votes).ThenBy(x => x.P.Title),
    };

    var total = await rows.CountAsync();
    var page = Math.Max(1, f.Page);
    var size = Math.Clamp(f.PageSize, 1, 100);

    var items = await ToListItems(rows.Skip((page - 1) * size).Take(size)).ToListAsync();
    return new PagedResult<ProjectListItem>(items, total, page, size);
```

## 4. LINQ у синтаксисі запитів: статистика за категоріями

`backend/CivicBudget.DAL/Repositories/StatisticsRepository.cs`, рядки 18–50. `from … join … group … by … into` над представленням `vw_ProjectResult`, далі left join з лімітами категорій.

```csharp
public async Task<List<CategoryStat>> GetByCategoryAsync(short campaignId)
{
    // 1) join уявлення vw_ProjectResult (вартість і голоси вже пораховано по проєкту) з довідником категорій,
    //    групування за категорією
    var perCategory = await (
        from r in _db.VwProjectResults
        join c in _db.Categories on r.CategoryId equals c.CategoryId
        where r.CampaignId == campaignId
        group r by new { c.CategoryId, c.Name } into g
        select new
        {
            g.Key.CategoryId,
            g.Key.Name,
            ProjectCount = g.Count(),
            TotalCost = g.Sum(x => x.EstimatedCost),
            TotalVotes = g.Sum(x => x.TotalVotes)
        }).ToListAsync();

    // 2) ліміти категорій кампанії; left join (join … into … DefaultIfEmpty) — категорії без проєктів теж видно
    var limits = await (
        from cc in _db.CampaignCategories
        join c in _db.Categories on cc.CategoryId equals c.CategoryId
        where cc.CampaignId == campaignId
        orderby c.CategoryId
        select new { c.CategoryId, c.Name, cc.BudgetLimit }).ToListAsync();

    return (
        from l in limits
        join s in perCategory on l.CategoryId equals s.CategoryId into stats
        from s in stats.DefaultIfEmpty()
        orderby s == null ? 0 : s.TotalVotes descending, l.Name
        select new CategoryStat(l.Name, s?.ProjectCount ?? 0, s?.TotalCost ?? 0, s?.TotalVotes ?? 0, l.BudgetLimit))
        .ToList();
```

## 5. ADO.NET, з'єднаний сценарій: виклик процедури

`backend/CivicBudget.DAL/Sql/ProcedureRepository.cs`, рядки 55–85. `SqlConnection` → `SqlCommand` (`CommandType.StoredProcedure`) → `SqlDataReader` читає рейтинг рядок за рядком; помилки 50001–50020 перекладаються в повідомлення для користувача.

```csharp
public async Task<List<WinnerRow>> SelectWinnersAsync(short campaignId)
{
    var result = new List<WinnerRow>();
    try
    {
        await using SqlConnection connection = await _factory.OpenAsync();

        await using var command = new SqlCommand("usp_SelectWinners", connection)
        {
            CommandType = CommandType.StoredProcedure,
            CommandTimeout = 120
        };
        command.Parameters.Add(new SqlParameter("@CampaignId", SqlDbType.SmallInt) { Value = campaignId });

        await using SqlDataReader reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            result.Add(new WinnerRow(
                CategoryId: reader.GetByte(0),
                Place: reader.GetInt32(1),
                ProjectId: reader.GetInt32(2),
                Votes: reader.GetInt32(3),
                Cost: reader.GetDecimal(4),
                IsWinner: reader.GetInt32(5) == 1));
        }
    }
    catch (SqlException ex) when (ex.Number is >= 50001 and <= 50020)
    {
        throw DbErrors.Translate(ex)!;
    }
    return result;
```

## 6. ADO.NET, від'єднаний сценарій: журнал аудиту

`backend/CivicBudget.DAL/Sql/AuditRepository.cs`, рядки 46–70. `SqlDataAdapter.Fill` заповнює дві таблиці `DataSet`, з'єднання закривається, далі дані в пам'яті (`DataView`).

```csharp
var dataSet = new DataSet("Audit");

await using (SqlConnection connection = await _factory.OpenAsync())
{
    using var command = new SqlCommand(sql, connection);
    command.Parameters.Add("@From", SqlDbType.DateTime2).Value = (object?)f.From?.Date ?? DBNull.Value;
    command.Parameters.Add("@To", SqlDbType.DateTime2).Value = (object?)f.To?.Date ?? DBNull.Value;
    command.Parameters.Add("@Action", SqlDbType.VarChar, 30).Value = Empty(f.Action);
    command.Parameters.Add("@Entity", SqlDbType.VarChar, 50).Value = Empty(f.Entity);
    command.Parameters.Add("@User", SqlDbType.NVarChar, 100).Value = Empty(f.User);
    command.Parameters.Add("@Skip", SqlDbType.Int).Value = (page - 1) * pageSize;
    command.Parameters.Add("@Take", SqlDbType.Int).Value = pageSize;

    // SqlDataAdapter.Fill: дві вибірки → дві таблиці DataSet
    using var adapter = new SqlDataAdapter(command);
    adapter.TableMappings.Add("Table", "Total");
    adapter.TableMappings.Add("Table1", "AuditLog");
    adapter.Fill(dataSet);
} // з'єднання закрито — далі дані лише в пам'яті

int total = Convert.ToInt32(dataSet.Tables["Total"]!.Rows[0]["Total"]);
DataTable table = dataSet.Tables["AuditLog"]!;

// DataView — представлення DataTable з сортуванням
var view = new DataView(table) { Sort = "CreatedAt DESC, AuditId DESC" };
```

## 7. Виклик функції БД

`backend/CivicBudget.DAL/Sql/FunctionRepository.cs`, рядки 20–28. Скалярна функція `dbo.fn_RemainingVotes` — параметризований `SELECT` і `ExecuteScalar`.

```csharp
public async Task<int> GetRemainingVotesAsync(int voterId, short campaignId)
{
    await using SqlConnection connection = await _factory.OpenAsync();
    await using var command = new SqlCommand("SELECT dbo.fn_RemainingVotes(@VoterId, @CampaignId);", connection);
    command.Parameters.Add("@VoterId", SqlDbType.Int).Value = voterId;
    command.Parameters.Add("@CampaignId", SqlDbType.SmallInt).Value = campaignId;

    object? value = await command.ExecuteScalarAsync();
    return value is int n ? n : 0;
```

## 8. Сесійний контекст для тригера аудиту

`backend/CivicBudget.DAL/Infrastructure/SessionContextInterceptor.cs`, рядки 19–23. Після відкриття з'єднання застосунок кладе UserId та IP у `SESSION_CONTEXT`; тригер `TR_Project_StatusChange` пише їх в `AuditLog`.

```csharp
public override void ConnectionOpened(DbConnection connection, ConnectionEndEventData eventData)
{
    using var cmd = SessionContext.CreateCommand(connection, _currentUser);
    cmd.ExecuteNonQuery();
}
```

## 9. Сервіс голосування: правила перевіряє БД

`backend/CivicBudget.Api/Services/VotingService.cs`, рядки 59–80. Сервіс лише додає голос або збільшує `VoteCount`; третій голос за проєкт відхиляє тригер (THROW 50003).

```csharp
public async Task<MyBallot> CastAsync(int voterId, int projectId)
{
    var vote = await _votes.GetAsync(voterId, projectId);
    if (vote == null)
        _votes.Add(new Vote { VoterId = voterId, ProjectId = projectId, VoteCount = 1, Channel = "online", CastAt = DateTime.Now });
    else if (vote.Channel != "online")
    {
        // Паперовий рядок не можна «доповнювати» онлайн: UPDATE VoteCount не змінює Channel,
        // тож тригер 50005 цього не побачить. Повідомлення — те саме, що для 50005.
        throw new BusinessRuleException(
            "Ви вже голосували в цій кампанії іншим способом (онлайн або паперовим бюлетенем). Змішувати способи не можна.",
            50005);
    }
    else
    {
        vote.VoteCount++;          // третій голос за проєкт → тригер кине 50003
        vote.CastAt = DateTime.Now;
    }

    await DbErrors.Run(_votes.SaveAsync);
    await NotifyAsync(projectId);
    return await GetMyBallotAsync(voterId);
```

## 10. Переклад помилок SQL Server

`backend/CivicBudget.DAL/Infrastructure/BusinessRuleException.cs`, рядки 57–70. Номер помилки з `THROW` (50001–50020) → `BusinessRuleException` з текстом українською.

```csharp
public static BusinessRuleException? Translate(Exception ex)
{
    var sql = FindSqlException(ex);
    if (sql == null) return null;

    if (Messages.TryGetValue(sql.Number, out var text))
        return new BusinessRuleException(text, sql.Number, ex);

    // інші користувацькі помилки з THROW (50000+) — показуємо текст із БД
    if (sql.Number >= 50000)
        return new BusinessRuleException(sql.Message, sql.Number, ex);

    return null;
}
```

## 11. Обробка помилок для всіх запитів

`backend/CivicBudget.Api/Infrastructure/ErrorHandlingMiddleware.cs`, рядки 37–54. Порушення правила → 400, немає прав → 403, не знайдено → 404; користувач не бачить технічних подробиць.

```csharp
private static (int, string, int) Map(Exception ex)
{
    switch (ex)
    {
        case BusinessRuleException b:
            return (400, b.Message, b.Code);
        case KeyNotFoundException k:
            return (404, k.Message, 0);
        case UnauthorizedAccessException u:
            return (403, string.IsNullOrEmpty(u.Message) || u.Message.StartsWith("Attempted")
                ? "Недостатньо прав для цієї дії." : u.Message, 0);
    }

    // SqlException, яку не переклали в репозиторії
    var translated = DbErrors.Translate(ex);
    if (translated != null) return (400, translated.Message, translated.Code);

    return (500, "Внутрішня помилка сервера. Спробуйте ще раз.", 0);
```

## 12. Контролер з перевіркою ролі

`backend/CivicBudget.Api/Controllers/RoleControllers.cs`, рядки 148–169. `[Authorize(Roles = …)]` — RBAC: роль із таблиць AppRole/UserRole потрапляє в JWT.

```csharp
/// <summary>Мешканець: онлайн-голосування.</summary>
[ApiController]
[Authorize(Roles = Roles.Resident)]
[Route("api/voting")]
public class VotingController : ControllerBase
{
    private readonly VotingService _voting;
    private readonly HttpCurrentUser _user;

    public VotingController(VotingService voting, HttpCurrentUser user)
    {
        _voting = voting;
        _user = user;
    }

    /// <summary>Мій бюлетень: проєкти, мої голоси, скільки лишилось.</summary>
    [HttpGet("my")]
    public Task<MyBallot> My() => _voting.GetMyBallotAsync(_user.RequireUserId());

    /// <summary>Віддати голос за проєкт (+1). Правила перевіряє тригер TR_Vote_CheckRules.</summary>
    [HttpPost("{projectId:int}")]
    public Task<MyBallot> Cast(int projectId) => _voting.CastAsync(_user.RequireUserId(), projectId);
```

## 13. Етапи кампанії лише по черзі

`backend/CivicBudget.Api/Services/CampaignService.cs`, рядки 147–158. До підрахунку голосів можна повернутися на крок назад, після — ні; перестрибнути етап не можна.

```csharp
if (target == from) blocker = "Кампанія вже на цьому етапі.";
else if (target < from)
{
    if (from >= Array.IndexOf(Statuses, "counting"))
        blocker = "Після початку підрахунку голосів повернутися на попередній етап не можна.";
    else if (target != from - 1)
        blocker = "Повернутися можна лише на один етап назад.";
    else
        consequences.Add("Кампанія повернеться на попередній етап; ухвалені рішення щодо проєктів не зміняться.");
}
else if (target != from + 1)
    blocker = "Етапи перемикаються лише по черзі, без пропусків.";
```

## 14. Тригер голосування (SQL)

`db/CivicBudget_create.sql`, рядки 449–489. Фрагмент тригера: недоступне голосування (50001), вік і верифікація (50002), не більше 2 голосів за проєкт (50003).

```sql
CREATE TRIGGER TR_Vote_CheckRules
ON Vote
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN Project p ON p.ProjectId = i.ProjectId
        JOIN Campaign c ON c.CampaignId = p.CampaignId
        WHERE p.Status <> 'published'
            OR (i.Channel = 'online' AND (c.Status <> 'voting'
                OR CAST(i.CastAt AS date) NOT BETWEEN c.VotingStart AND c.VotingEnd))
            -- паперові можна вносити ще під час підрахунку
            OR (i.Channel = 'paper' AND c.Status NOT IN ('voting', 'counting'))
    )
        THROW 50001, N'Голосування за цей проєкт зараз недоступне.', 1;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN UserAccount u ON u.UserId = i.VoterId
        JOIN Project p ON p.ProjectId = i.ProjectId
        JOIN Campaign c ON c.CampaignId = p.CampaignId
        WHERE u.VerificationStatus <> 'verified'
            OR u.IsBlocked = 1
            OR DATEADD(year, c.MinVoterAge, u.BirthDate) > CAST(i.CastAt AS date)
    )
        THROW 50002, N'Виборець не верифікований, заблокований або не досяг мінімального віку.', 1;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN Project p ON p.ProjectId = i.ProjectId
        JOIN Campaign c ON c.CampaignId = p.CampaignId
        WHERE i.VoteCount > c.MaxVotesPerProject
    )
        THROW 50003, N'Перевищено кількість голосів за один проєкт.', 1;
```

## 15. Функції БД (SQL)

`db/CivicBudget_v2_extensions.sql`, рядки 11–25. Скалярна функція рахує залишок так само, як тригер перевіряє ліміт.

```sql
CREATE OR ALTER FUNCTION dbo.fn_RemainingVotes (@VoterId int, @CampaignId smallint)
RETURNS int
AS
BEGIN
    DECLARE @Limit int, @Used int;

    SELECT @Limit = VotesPerVoter FROM dbo.Campaign WHERE CampaignId = @CampaignId;
    IF @Limit IS NULL RETURN NULL;   -- кампанії немає

    SELECT @Used = ISNULL(SUM(v.VoteCount), 0)
    FROM dbo.Vote v
    JOIN dbo.Project p ON p.ProjectId = v.ProjectId
    WHERE v.VoterId = @VoterId AND p.CampaignId = @CampaignId;

    RETURN CASE WHEN @Limit > @Used THEN @Limit - @Used ELSE 0 END;
```

## 16. Фронтенд: підтвердження голосу

`frontend/src/pages/VotingPage.tsx`, рядки 52–59. Голос не можна відкликати, тому перед ним — підтвердження з поясненням.

```tsx
const confirmVote = (p: BallotProject) =>
  modal.confirm({
    title: t('Віддати голос за «{{title}}»?', { title: p.title }),
    content: t('Голос остаточний: відкликати його чи перенести на інший проєкт не можна.'),
    okText: t('Віддати голос'),
    cancelText: t('Скасувати'),
    onOk: () => vote(p),
  })
```

## 17. Фронтенд: тихе оновлення токена

`frontend/src/api/client.ts`, рядки 40–61. Якщо access-токен (15 хв) прострочився, клієнт один раз оновлює пару за refresh-токеном і повторює запит.

```ts
async function tryRefresh(): Promise<boolean> {
  const auth = loadAuth()
  if (!auth) return false
  refreshing ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: auth.refreshToken }),
      })
      if (!res.ok) {
        saveAuth(null)
        return false
      }
      saveAuth((await res.json()) as AuthResponse)
      return true
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}
```
