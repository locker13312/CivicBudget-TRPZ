-- Розширення БД CivicBudget, версія 2: функції користувача.
-- Запускати після CivicBudget_create.sql і перед CivicBudget_demo.sql (reset.ps1 робить це сам).
-- Таблиці, ключі й обмеження зі зданого проєкту БД не змінюються: скрипт лише додає нові об'єкти.

USE CivicBudget;
GO

-- Скільки голосів виборець ще може віддати в кампанії.
-- Рахує так само, як тригер TR_Vote_CheckRules (сума VoteCount по всіх проєктах кампанії, обидва канали),
-- тому лічильник в інтерфейсі ніколи не розходиться з тим, що пропустить тригер.
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
END;
GO

-- Бюджет категорій кампанії: ліміт, використано на переможців, залишок.
-- «Використано» — вартість (vw_ProjectCost) проєктів, що пройшли відбір: переможці, ті, що реалізуються, і реалізовані.
-- До визначення переможців використано 0, а залишок дорівнює ліміту.
CREATE OR ALTER FUNCTION dbo.fn_CategoryBudgetBalance (@CampaignId smallint)
RETURNS TABLE
AS
RETURN
    SELECT cc.CategoryId, c.Name AS CategoryName, cc.BudgetLimit,
        ISNULL(w.Used, 0) AS Used,
        cc.BudgetLimit - ISNULL(w.Used, 0) AS Balance,
        ISNULL(w.Winners, 0) AS Winners
    FROM dbo.CampaignCategory cc
    JOIN dbo.Category c ON c.CategoryId = cc.CategoryId
    LEFT JOIN (
        SELECT p.CategoryId, SUM(pc.EstimatedCost) AS Used, COUNT(*) AS Winners
        FROM dbo.Project p
        JOIN dbo.vw_ProjectCost pc ON pc.ProjectId = p.ProjectId
        WHERE p.CampaignId = @CampaignId AND p.Status IN ('winner', 'implementing', 'completed')
        GROUP BY p.CategoryId
    ) w ON w.CategoryId = cc.CategoryId
    WHERE cc.CampaignId = @CampaignId;
GO
