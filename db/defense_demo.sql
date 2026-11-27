-- =====================================================================
-- Показ БД CivicBudget на захисті (SSMS). Виконувати блоками: виділити блок → F5.
-- Увесь скрипт можна виконати й цілком: кожна зміна йде в BEGIN TRAN … ROLLBACK,
-- тому дані після нього такі самі, як до нього (перевірка — в останньому блоці).
-- Потрібна БД у демо-стані: reset.bat.
-- =====================================================================
USE CivicBudget;
GO
SET NOCOUNT ON;

-- «Відбиток» даних до показу — порівнюється в останньому блоці
IF OBJECT_ID('tempdb..#Before') IS NOT NULL DROP TABLE #Before;
SELECT (SELECT COUNT(*) FROM Vote) AS Votes, (SELECT COUNT(*) FROM AuditLog) AS Audit,
       (SELECT COUNT(*) FROM Notification) AS Notifications,
       (SELECT CHECKSUM_AGG(CHECKSUM(ProjectId, Status)) FROM Project) AS Statuses,
       (SELECT CHECKSUM_AGG(CHECKSUM(CampaignId, Status)) FROM Campaign) AS Campaigns
INTO #Before;
GO

-- =====================================================================
-- 1. ПРЕДСТАВЛЕННЯ (уявлення): похідні дані не зберігаються, а рахуються запитом
-- =====================================================================

-- 1.1 vw_ProjectCost: вартість проєкту = сума позицій кошторису (BudgetItem.Amount — обчислюване поле)
SELECT TOP (6) ProjectId, CampaignId, EstimatedCost, ItemCount
FROM vw_ProjectCost
ORDER BY ProjectId DESC;

-- 1.2 vw_ProjectResult: голоси онлайн і паперові, кількість виборців (поточна кампанія)
SELECT RegNumber, Title, EstimatedCost, TotalVotes, OnlineVotes, PaperVotes, VoterCount
FROM vw_ProjectResult
WHERE CampaignId = 2
ORDER BY TotalVotes DESC;

-- 1.3 vw_ImplementationProgress: план/факт реалізації
SELECT i.ImplementationId, p.Title, i.Status, i.PlannedBudget, i.ActualCost, i.StagesDone, i.StagesTotal
FROM vw_ImplementationProgress i
JOIN Project p ON p.ProjectId = i.ProjectId;
GO

-- =====================================================================
-- 2. ФУНКЦІЇ (db/CivicBudget_v2_extensions.sql)
-- =====================================================================

-- 2.1 Скалярна: скільки голосів лишилось виборцю в кампанії 2
SELECT u.UserId, u.LastName + N' ' + u.FirstName AS Виборець,
       dbo.fn_RemainingVotes(u.UserId, 2) AS [Лишилось голосів]
FROM UserAccount u
WHERE u.UserId IN (7, 8, 9);   -- ще не голосував / 3 голоси онлайн / паперовий бюлетень

-- 2.2 Таблична: бюджет категорій минулої кампанії (переможців уже визначено)
SELECT CategoryName AS Категорія, BudgetLimit AS Ліміт, Used AS Використано, Balance AS Залишок, Winners AS Переможців
FROM dbo.fn_CategoryBudgetBalance(1);
GO

-- =====================================================================
-- 3. ТРИГЕР TR_Vote_CheckRules: правила голосування перевіряє БД
-- =====================================================================

-- 3.1 Голос 15-річного → 50002
BEGIN TRY
    BEGIN TRAN;
    INSERT INTO Vote (VoterId, ProjectId, VoteCount, Channel) VALUES (10, 7, 1, 'online');
    ROLLBACK;
    SELECT N'Голос прийнято — правило не спрацювало' AS Результат;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    SELECT N'Голос 15-річного' AS Спроба, ERROR_NUMBER() AS Код, ERROR_MESSAGE() AS Повідомлення;
END CATCH;

-- 3.2 Третій голос за той самий проєкт → 50003 (два голоси проходять, третій — ні)
BEGIN TRY
    BEGIN TRAN;
    INSERT INTO Vote (VoterId, ProjectId, VoteCount, Channel) VALUES (7, 7, 2, 'online');
    SELECT N'Два голоси прийнято' AS Крок, dbo.fn_RemainingVotes(7, 2) AS [Лишилось];
    UPDATE Vote SET VoteCount = 3 WHERE VoterId = 7 AND ProjectId = 7;   -- так робить застосунок: VoteCount + 1
    ROLLBACK;
    SELECT N'Третій голос прийнято — правило не спрацювало' AS Результат;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    SELECT N'Третій голос за проєкт' AS Спроба, ERROR_NUMBER() AS Код, ERROR_MESSAGE() AS Повідомлення;
END CATCH;
GO

-- =====================================================================
-- 4. ТРИГЕР TR_Project_StatusChange: зміна статусу → AuditLog + Notification
-- Хто змінив — застосунок кладе в SESSION_CONTEXT при відкритті з'єднання (SessionContextInterceptor).
-- =====================================================================
EXEC sp_set_session_context @key = N'UserId', @value = 3;          -- експерт
EXEC sp_set_session_context @key = N'Ip', @value = '192.168.0.15';

DECLARE @LastAudit bigint = (SELECT MAX(AuditId) FROM AuditLog),
        @LastNotif bigint = (SELECT MAX(NotificationId) FROM Notification);

BEGIN TRAN;
    -- проєкт на експертизі повертається автору на доопрацювання
    UPDATE Project SET Status = 'revision', UpdatedAt = SYSDATETIME() WHERE ProjectId = 15;

    SELECT N'Новий запис AuditLog' AS [Що з'явилось], AuditId, UserId, ActionCode, EntityName, EntityId, Details, IpAddress
    FROM AuditLog WHERE AuditId > @LastAudit;

    SELECT N'Нове сповіщення автору' AS [Що з'явилось], n.NotificationId, u.LastName + N' ' + u.FirstName AS Кому,
           n.NotifType, n.Body
    FROM Notification n JOIN UserAccount u ON u.UserId = n.UserId
    WHERE n.NotificationId > @LastNotif;
ROLLBACK;

EXEC sp_set_session_context @key = N'UserId', @value = NULL;
EXEC sp_set_session_context @key = N'Ip', @value = NULL;
GO

-- =====================================================================
-- 5. ПРОЦЕДУРА usp_SubmitProject: подання з перевірками 50010–50015 і номером GB-рік-NNNN
-- =====================================================================

-- 5.1 Повторне подання проєкту з доопрацювання (№16 «STEM-лабораторія») — успішно, номер зберігається
BEGIN TRAN;
    EXEC usp_SubmitProject @ProjectId = 16;
    SELECT ProjectId, RegNumber, Status, SubmittedAt FROM Project WHERE ProjectId = 16;
ROLLBACK;

-- 5.2 Подання чернетки, коли прийом закрито → 50012
BEGIN TRY
    BEGIN TRAN;
    EXEC usp_SubmitProject @ProjectId = 13;
    ROLLBACK;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    SELECT N'Подання чернетки' AS Спроба, ERROR_NUMBER() AS Код, ERROR_MESSAGE() AS Повідомлення;
END CATCH;
GO

-- =====================================================================
-- 6. ПРОЦЕДУРА usp_SelectWinners: рейтинговий відбір у межах ліміту категорії
-- Спорт, ліміт 600 000: GB-2026-0001 (350 000) — перше місце; GB-2026-0002 (300 000) друге, але не вміщується в залишок 250 000;
-- GB-2026-0003 (120 000) — третє і проходить.
-- =====================================================================
BEGIN TRAN;
    UPDATE Campaign SET Status = 'counting' WHERE CampaignId = 2;   -- процедура вимагає етап «Підрахунок голосів»
    EXEC usp_SelectWinners @CampaignId = 2;                          -- рейтинг: категорія, місце, голоси, вартість, переможець
    SELECT CategoryName, BudgetLimit, Used, Balance, Winners FROM dbo.fn_CategoryBudgetBalance(2);
    SELECT Name, Status FROM Campaign WHERE CampaignId = 2;          -- кампанія перейшла в 'implementation'
ROLLBACK;

-- Без етапу «Підрахунок» процедура відмовляє → 50020
BEGIN TRY
    EXEC usp_SelectWinners @CampaignId = 2;
END TRY
BEGIN CATCH
    SELECT N'Визначення переможців під час голосування' AS Спроба, ERROR_NUMBER() AS Код, ERROR_MESSAGE() AS Повідомлення;
END CATCH;
GO

-- =====================================================================
-- 7. ПАРОЛІ: у БД лише bcrypt-хеші (char(60)), самих паролів немає
-- =====================================================================
SELECT Email, PasswordHash, LEN(PasswordHash) AS Довжина,
       LEFT(PasswordHash, 4) AS [Алгоритм $2a$], SUBSTRING(PasswordHash, 5, 2) AS [Вартість (cost)]
FROM UserAccount
WHERE PasswordHash IS NOT NULL
ORDER BY UserId;
GO

-- =====================================================================
-- 8. ПЕРЕВІРКА: дані не змінились
-- =====================================================================
SELECT CASE WHEN b.Votes = (SELECT COUNT(*) FROM Vote)
             AND b.Audit = (SELECT COUNT(*) FROM AuditLog)
             AND b.Notifications = (SELECT COUNT(*) FROM Notification)
             AND b.Statuses = (SELECT CHECKSUM_AGG(CHECKSUM(ProjectId, Status)) FROM Project)
             AND b.Campaigns = (SELECT CHECKSUM_AGG(CHECKSUM(CampaignId, Status)) FROM Campaign)
            THEN N'Дані не змінено' ELSE N'УВАГА: дані змінилися' END AS Перевірка
FROM #Before b;
DROP TABLE #Before;
GO
