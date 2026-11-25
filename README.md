# ІС «Громадський бюджет» — MVP (курсова робота з ТРПЗ)

Облік, голосування та реалізація проєктів громадського бюджету міста.
Стек: MS SQL Server · ASP.NET Core Web API (.NET 8, EF Core Database First, ADO.NET) · React 18 + TypeScript + Vite.

## Запуск (БД → бекенд → фронтенд)

Потрібно: SQL Server (Express), .NET 8 SDK (є у VS 2022), Node.js 18+.

### 1. База даних

```powershell
powershell -ExecutionPolicy Bypass -File db\reset.ps1
```

Скрипт перестворює БД `CivicBudget` (`db/CivicBudget_create.sql`) і заливає демо-дані (`db/CivicBudget_demo.sql`).
Наприкінці демо-скрипт показує 6 навмисних порушень (50002, 50003, 50004, 50005, 50001, UQ_Vote_Voter_Project) — **ці помилки очікувані** —
і кількість рядків у кожній таблиці. **Перед захистом запустіть `reset.ps1` ще раз** — БД повернеться до чистого демо-стану
(дати рахуються від сьогодні, голосування завжди «триває»). Бекенд перед цим краще зупинити.

Вручну (SSMS або sqlcmd). На цьому комп'ютері служба SQL Browser вимкнена, тому sqlcmd — через іменований канал:

```powershell
sqlcmd -S "np:\\.\pipe\MSSQL$SQLEXPRESS\sql\query" -E -C -i db\CivicBudget_create.sql
sqlcmd -S "np:\\.\pipe\MSSQL$SQLEXPRESS\sql\query" -E -C -i db\CivicBudget_demo.sql
```

(Встановлений sqlcmd — нова версія go-sqlcmd v1.10: параметра `-f 65001` у неї немає, файли вона й так читає як UTF-8.)

### 2. Бекенд

Visual Studio 2022: відкрити `backend/CivicBudget.sln`, стартовий проєкт `CivicBudget.Api`, профіль `http`, F5.
Або з консолі:

```powershell
cd backend\CivicBudget.Api
dotnet run --launch-profile http
```

API: <http://localhost:5080>, **Swagger: <http://localhost:5080/swagger>**.
У Swagger: виконати `POST /api/auth/login`, скопіювати `accessToken`, натиснути **Authorize**.
Рядок підключення — `backend/CivicBudget.Api/appsettings.json` (`Server=.\SQLEXPRESS;...` — для .NET працює без SQL Browser).

### 3. Фронтенд

```powershell
cd frontend
npm install
npm run dev
```

Відкрити <http://localhost:5173>. Vite проксує `/api` і `/hubs` на бекенд.
Інші команди: `npm run build`, `npm run lint` (ESLint), `npm run format` (Prettier).

## Демо-користувачі

Пароль для всіх: **`Demo123!`** (у БД — bcrypt-хеш). На сторінці входу є список — клік підставляє логін і пароль.

| Роль (ектор) | E-mail | Що показати |
|---|---|---|
| Адміністратор | admin@civicbudget.test | кампанія, етапи, «Визначити переможців», користувачі, аудит, статистика |
| Модератор | moderator@civicbudget.test | черга, рішення, публікація |
| Експерт | expert@civicbudget.test | висновок щодо проєкту на експертизі |
| Оператор | operator@civicbudget.test | паперовий бюлетень |
| Виконавець | executor@civicbudget.test | (звіти — у БД; UI відкладено) |
| Автор (мешканець) | author@civicbudget.test | мої проєкти, чернетка, доопрацювання, подання |
| Мешканець | resident@civicbudget.test | ще не голосував — для живого голосування |
| Мешканка | resident2@civicbudget.test | уже віддала 3 голоси онлайн |
| Мешканець | resident3@civicbudget.test | голосував паперовим бюлетенем (онлайн → помилка 50005) |
| Мешканець, 15 років | teen@civicbudget.test | спроба голосу → 50002 |
| Неверифікована | unverified@civicbudget.test | спроба голосу → 50002 |

Ще 20 виборців (UserId 12–31) без пароля — входять лише через «Увійти через BankID (демо)» або вносяться оператором.
Усі вони вже голосували в поточній кампанії, тому для **паперового бюлетеня** оператором беріть того, хто ще не голосував,
наприклад «Гончаренко» (автор, UserId 6). Якщо внести бюлетень для `resident@` після його онлайн-голосів — буде помилка 50005 (теж корисна для показу).

**Відвідувач** (без входу) бачить головну, каталог, картку проєкту і результати.

## Сценарій демо-ролика (≈3 хв)

1. **Автор** (`author@`) → «Мої проєкти» → «STEM-лабораторія» (на доопрацюванні, видно коментар модератора) →
   «+ Додати позицію» (столи й стільці, 36 000) — сума перераховується → «Подати повторно» → номер GB-2026-0009.
   *(Чернетку «Мультимедійний клас» подати не вийде: етап подання закінчився — повідомлення 50012 від `usp_SubmitProject`.)*
2. **Модератор** → «Модерація» → «Перевірити» → «✓ Допустити» → у «Допущені, готові до публікації» → «Опублікувати».
3. **Мешканець** (`resident@`) → «Голосування» → «+ Голос» за STEM-лабораторію двічі → третій раз — **«За один проєкт можна віддати не більше 2 голосів»** (тригер, 50003).
   Лічильник «Лишилось» зменшується. Сторінка «Результати» в іншій вкладці оновлюється сама (SignalR).
4. **Адміністратор** → «Кампанія» → етап «Підрахунок голосів» → «🏆 Визначити переможців» → таблиця рейтингу:
   у категорії «Спорт» скейт-парк (300 000, 2-ге місце) не вміщується в залишок ліміту 600 000 − 350 000, а тенісні столи (120 000, 3-тє) проходять.
5. **Результати** → переможці позначені.

Після репетиції — `db\reset.ps1`, щоб повернути початковий стан.

## Database First: Scaffold-DbContext

Модель EF Core (`backend/CivicBudget.DAL/Entities`, `CivicBudgetContext.cs`) згенеровано з наявної БД.
Package Manager Console у VS 2022 (Default project: `CivicBudget.DAL`):

```powershell
Install-Package Microsoft.EntityFrameworkCore.SqlServer -Version 8.0.11
Install-Package Microsoft.EntityFrameworkCore.Tools -Version 8.0.11
Scaffold-DbContext "Server=.\SQLEXPRESS;Database=CivicBudget;Trusted_Connection=True;TrustServerCertificate=True;" Microsoft.EntityFrameworkCore.SqlServer -OutputDir Entities -Context CivicBudgetContext -ContextDir . -NoOnConfiguring -Force
```

Те саме з консолі (так і запускалось): `dotnet ef dbcontext scaffold "<рядок>" Microsoft.EntityFrameworkCore.SqlServer --project CivicBudget.DAL --output-dir Entities --context CivicBudgetContext --context-dir . --no-onconfiguring --force`
(інструмент `dotnet-ef` 8.0.11 прописано в `backend/.config/dotnet-tools.json`, `dotnet tool restore`).

Scaffold сам підхопив тригери (`HasTrigger("TR_Vote_CheckRules")`, `HasTrigger("TR_Project_StatusChange")`) і уявлення
(`vw_ProjectCost`, `vw_ProjectResult`, `vw_ImplementationProgress` — keyless-сутності). Колонку `Project.Location` (geography) пропущено —
карта не входить у MVP (для неї потрібен пакет `...SqlServer.NetTopologySuite`).

## Де в коді матеріал лекцій 7–8

| Тема | Файл |
|---|---|
| Database First, ORM | `backend/CivicBudget.DAL/CivicBudgetContext.cs`, `Entities/` |
| DAL: інтерфейси репозиторіїв | `backend/CivicBudget.DAL/Repositories/Interfaces.cs` |
| DAL: EF-реалізації, LINQ-методи з лямбдами (`Where`, `OrderBy`, `ThenBy`), `Skip/Take` → OFFSET…FETCH | `Repositories/ProjectRepository.cs` → `SearchAsync` |
| LINQ query-синтаксис `join … group … by … into`, left join (`into … DefaultIfEmpty`) | `Repositories/StatisticsRepository.cs`, `ProjectRepository.GetResultsAsync` |
| ADO.NET, з'єднаний сценарій: `SqlConnection` + `SqlCommand` (`CommandType.StoredProcedure`) + `SqlDataReader` | `backend/CivicBudget.DAL/Sql/ProcedureRepository.cs` (`usp_SubmitProject`, `usp_SelectWinners`) |
| ADO.NET, від'єднаний сценарій: `SqlDataAdapter` → `DataSet`/`DataTable` → `DataView`; `OFFSET … FETCH NEXT` | `Sql/AuditRepository.cs` → `GetPageAsync` |
| Перехоплення `SqlException` 50001–50020 → зрозуміле повідомлення | `DAL/Infrastructure/BusinessRuleException.cs` (`DbErrors`) |
| `SESSION_CONTEXT` для тригера аудиту (`DbConnectionInterceptor`) | `DAL/Infrastructure/SessionContextInterceptor.cs`, `Sql/SqlConnectionFactory.cs` |
| Бізнес-логіка (сервіси) | `backend/CivicBudget.Api/Services/` |
| JWT (access 15 хв, refresh 7 днів), ролі | `backend/CivicBudget.Api/Auth/AuthInfrastructure.cs`, `Program.cs` |
| SignalR | `Api/Hubs/ResultsHub.cs`, `frontend/src/api/signalr.ts` |

Контролери звертаються до даних лише через сервіси й репозиторії (DbContext у контролерах не використовується).

## Структура

```
CivicBudget-TRPZ/
  db/                        CivicBudget_create.sql, CivicBudget_demo.sql, reset.ps1, документ про БД
  backend/CivicBudget.sln
    CivicBudget.DAL/         Entities/ (scaffold), CivicBudgetContext.cs, Models/ (моделі читання),
                             Repositories/ (інтерфейси + EF), Sql/ (ADO.NET), Infrastructure/
    CivicBudget.Api/         Controllers/, Services/, Dto/, Auth/, Hubs/, Infrastructure/ (обробка помилок)
  frontend/src/              api/ (клієнт, типи, SignalR), auth/, components/, pages/
  docs/screens/              скріни всіх форм (для записки)
```

## REST API (ендпоінти)

| Метод | Шлях | Хто |
|---|---|---|
| POST | /api/auth/login, /api/auth/refresh | усі |
| GET/POST | /api/auth/bankid-demo/users, /api/auth/bankid-demo | усі (імітація BankID) |
| GET | /api/auth/me | після входу |
| GET | /api/reference | довідники |
| GET | /api/campaigns, /api/campaigns/current, /api/campaigns/{id}, /api/campaigns/results | усі |
| GET | /api/projects (пошук, фільтри, сторінки), /api/projects/{id} | усі |
| GET/PUT/DELETE | /api/projects/{id}/subscription | після входу |
| GET/POST | /api/notifications, /unread-count, /{id}/read, /read-all | після входу |
| GET/POST/PUT | /api/my/projects, /{id}, /{id}/submit | мешканець (автор) |
| GET/POST | /api/moderation/queue, /{id}/decision, /{id}/publish | модератор |
| GET/POST | /api/expertise, /{id}/conclusion | експерт |
| GET/POST | /api/voting/my, /api/voting/{projectId} | мешканець |
| GET/POST | /api/operator/voters, /api/operator/ballots | оператор |
| POST/PUT | /api/admin/campaigns, /{id}, /{id}/status, /{id}/select-winners | адміністратор |
| GET/PUT | /api/admin/users, /users/{id}/roles, /users/{id}/block | адміністратор |
| GET | /api/admin/audit, /api/admin/statistics | адміністратор |
| WS | /hubs/results (SignalR, подія `votesChanged`) | усі |

## Примітки

- `CivicBudget_create.sql` **не змінювався** — пройшов на SQL Server 2022 Express без помилок і перезапускається.
- `CivicBudget_demo.sql` написано заново (оригінал втрачено). Голоси минулої кампанії вносяться, поки вона на етапі «голосування»,
  а переможців визначає сама `usp_SelectWinners`. Статуси проєктів змінюються через UPDATE, тож журнал аудиту й сповіщення
  заповнює тригер `TR_Project_StatusChange`.
- Окремої таблиці для refresh-токенів у схемі немає, тому refresh-токен — підписаний JWT на 7 днів (`typ=refresh`).
- Робочий процес модерації без нових статусів: «Допустити» — статус `moderation` + рецензія `approve` (з'являється в «готових до публікації»);
  «На експертизу» — `expertise`; позитивний висновок експерта повертає проєкт модератору для публікації.
- Відкладено (розвиток): картки реалізації і звіти виконавців в UI (дані вже є в БД), карта, e-mail, справжні BankID/Дія.
