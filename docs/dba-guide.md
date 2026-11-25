# Інструкція адміністратора бази даних

БД `CivicBudget`, MS SQL Server 2022. Скрипти — у `db/`:

| Файл | Призначення |
|---|---|
| `CivicBudget_create.sql` | створює БД з нуля (перезапускається: видаляє наявну) — таблиці, індекси, уявлення, тригери, процедури, довідники |
| `CivicBudget_demo.sql` | демо-дані; дати рахуються від `GETDATE()`; наприкінці — перевірка 6 навмисних порушень і кількість рядків у таблицях |
| `reset.ps1` / `reset.bat` | create + demo + копіювання демо-файлів у `uploads/` |
| `demo-files/` | фото й PDF для демо-вкладень |

Підключення `sqlcmd`, коли служба SQL Browser вимкнена:

```powershell
sqlcmd -S "np:\\.\pipe\MSSQL$SQLEXPRESS\sql\query" -E -C -d CivicBudget
```

## Об'єкти

**Таблиці (20):** довідники `District`, `Category`, `AppRole`, `Contractor`, `PollingStation`; користувачі `UserAccount`, `UserRole`;
кампанії `Campaign`, `CampaignCategory`; проєкти `Project`, `BudgetItem`, `Review`, `Subscription`; голосування `Vote`;
реалізація `Implementation`, `ImplementationStage`, `Report`, `Attachment`; службові `Notification`, `AuditLog`.

**Уявлення:** `vw_ProjectCost` (вартість = сума кошторису), `vw_ProjectResult` (голоси онлайн / паперові / виборці),
`vw_ImplementationProgress` (план / факт, виконані етапи).

**Тригери:**

| Тригер | Подія | Що робить |
|---|---|---|
| `TR_Vote_CheckRules` | AFTER INSERT, UPDATE на `Vote` | перевіряє правила голосування, `THROW 50001–50005` |
| `TR_Project_StatusChange` | AFTER UPDATE на `Project` | пише зміну статусу в `AuditLog` і створює сповіщення автору та підписникам |

**Процедури:** `usp_SubmitProject @ProjectId` — подання (номер GB-рік-NNNN), `usp_SelectWinners @CampaignId` — переможці в межах лімітів категорій.

## Коди помилок

| Код | Джерело | Значення |
|---|---|---|
| 50001 | TR_Vote_CheckRules | проєкт не опублікований або голосування не триває |
| 50002 | TR_Vote_CheckRules | виборець не верифікований, заблокований або молодший за мінімальний вік |
| 50003 | TR_Vote_CheckRules | більше 2 голосів за проєкт |
| 50004 | TR_Vote_CheckRules | більше 5 голосів у кампанії |
| 50005 | TR_Vote_CheckRules | виборець уже голосував іншим способом |
| 50010–50015 | usp_SubmitProject | не знайдено, не той статус, прийом закрито, немає опису/місця, вартість поза межами, ліміт проєктів автора |
| 50020 | usp_SelectWinners | кампанія не на етапі `counting` |

Застосунок перекладає ці коди у зрозумілі повідомлення (`DbErrors`). Новий код — додайте й туди.

## Аудит і контекст сесії

Застосунок після відкриття кожного з'єднання викликає `sp_set_session_context` з ключами `UserId` і `Ip`.
Тригер `TR_Project_StatusChange` читає їх через `SESSION_CONTEXT(N'UserId')`. Для ручних змін статусу з SSMS виконайте те саме,
інакше в журналі буде `UserId = NULL`:

```sql
EXEC sp_set_session_context @key = N'UserId', @value = 1;
EXEC sp_set_session_context @key = N'Ip', @value = '127.0.0.1';
```

## Резервне копіювання й відновлення

```sql
BACKUP DATABASE CivicBudget TO DISK = N'C:\Backup\CivicBudget.bak' WITH INIT, COMPRESSION, CHECKSUM;
RESTORE VERIFYONLY FROM DISK = N'C:\Backup\CivicBudget.bak';

-- відновлення (застосунок зупинено)
ALTER DATABASE CivicBudget SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
RESTORE DATABASE CivicBudget FROM DISK = N'C:\Backup\CivicBudget.bak' WITH REPLACE;
ALTER DATABASE CivicBudget SET MULTI_USER;
```

SQL Server Express не має SQL Agent — плановий бекап налаштовують через Планувальник завдань Windows (`sqlcmd -Q "BACKUP …"`).
Разом із БД копіюйте папку вкладень `uploads/` бекенду: у БД лише шляхи до файлів.

## Обслуговування

- Перевірка цілісності: `DBCC CHECKDB (CivicBudget) WITH NO_INFOMSGS;`
- Оновлення статистики: `EXEC sp_updatestats;`
- `AuditLog` і `Notification` ростуть постійно; архівування старих записів (наприклад, старших за 3 роки) — за регламентом установи.
- Кількість рядків у таблицях — останній блок `CivicBudget_demo.sql` можна виконати окремо як звіт.

## Права доступу

Застосунок працює під обліковим записом Windows (`Trusted_Connection`). Для промислового стенду — окремий логін з роллю
`db_datareader`, `db_datawriter` і `GRANT EXECUTE` на процедури; змінювати схему цьому логіну не потрібно.
Модель EF Core згенерована з БД (Database First): після змін схеми її перегенеровують (див. `programmer-guide.md`).
