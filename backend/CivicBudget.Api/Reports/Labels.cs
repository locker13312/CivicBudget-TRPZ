namespace CivicBudget.Api.Reports;

/// <summary>Українські назви кодів статусів (як у БД) — для звітів і відкритих даних у CSV.</summary>
public static class Labels
{
    private static string Get(IReadOnlyDictionary<string, string> map, string? code) =>
        code != null && map.TryGetValue(code, out var v) ? v : code ?? "";

    private static readonly Dictionary<string, string> Project = new()
    {
        ["draft"] = "Чернетка", ["submitted"] = "Подано", ["moderation"] = "На модерації", ["revision"] = "На доопрацюванні",
        ["expertise"] = "На експертизі", ["rejected"] = "Відхилено", ["published"] = "Опубліковано", ["winner"] = "Переможець",
        ["not_selected"] = "Не відібрано", ["implementing"] = "Реалізується", ["completed"] = "Реалізовано",
    };

    private static readonly Dictionary<string, string> Campaign = new()
    {
        ["draft"] = "Чернетка", ["submission"] = "Подання проєктів", ["review"] = "Розгляд", ["voting"] = "Голосування",
        ["counting"] = "Підрахунок голосів", ["implementation"] = "Реалізація", ["closed"] = "Завершено",
    };

    private static readonly Dictionary<string, string> Implementation = new()
    {
        ["planned"] = "Заплановано", ["in_progress"] = "Виконується", ["suspended"] = "Призупинено", ["completed"] = "Завершено",
    };

    private static readonly Dictionary<string, string> Stage = new()
    {
        ["planned"] = "Заплановано", ["in_progress"] = "Виконується", ["done"] = "Виконано",
    };

    private static readonly Dictionary<string, string> Review = new()
    {
        ["moderation"] = "Модерація", ["technical"] = "Технічна експертиза", ["legal"] = "Юридична експертиза",
        ["financial"] = "Фінансова експертиза",
    };

    private static readonly Dictionary<string, string> Decisions = new()
    {
        ["approve"] = "Погоджено", ["revise"] = "На доопрацювання", ["reject"] = "Відхилено",
    };

    public static string ProjectStatus(string? c) => Get(Project, c);
    public static string CampaignStatus(string? c) => Get(Campaign, c);
    public static string ImplementationStatus(string? c) => Get(Implementation, c);
    public static string StageStatus(string? c) => Get(Stage, c);
    public static string ReviewType(string? c) => Get(Review, c);
    public static string Decision(string? c) => Get(Decisions, c);
}
