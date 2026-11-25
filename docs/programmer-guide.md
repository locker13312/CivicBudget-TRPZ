# Інструкція програміста

## Рішення й шари

```
backend/CivicBudget.sln
├─ CivicBudget.DAL      доступ до даних: модель EF Core (Database First), репозиторії, ADO.NET
├─ CivicBudget.Api      ASP.NET Core Web API: контролери, сервіси, звіти, автентифікація, SignalR
└─ CivicBudget.Tests    xUnit
frontend/               React + TypeScript + Vite + Ant Design
```

Потік запиту: **React-сторінка → `api/client.ts` → контролер → сервіс → інтерфейс репозиторію → EF Core / ADO.NET → SQL Server**.

- Контролери тонкі: перевірка ролі (`[Authorize(Roles = …)]`), виклик сервісу. `DbContext` у контролерах не використовується.
- Сервіси (`Api/Services`) — сценарії предметної області. Правила, які вже є в БД (тригер `TR_Vote_CheckRules`, процедури
  `usp_SubmitProject`, `usp_SelectWinners`, CHECK-обмеження), сервіси **не дублюють**.
- Репозиторії (`DAL/Repositories`) повертають моделі читання (`DAL/Models/ReadModels.cs`) — проєкції LINQ без навігаційних властивостей.
- ADO.NET (`DAL/Sql`): `ProcedureRepository` — `SqlCommand` з `CommandType.StoredProcedure` + `SqlDataReader`;
  `AuditRepository` — від'єднаний сценарій `SqlDataAdapter` → `DataSet`/`DataTable` → `DataView`.

## Помилки

| Виняток | HTTP | Де виникає |
|---|---|---|
| `BusinessRuleException` | 400 `{message, code}` | порушене правило: у сервісі або `SqlException` 50001–50020, перекладений `DbErrors` |
| `KeyNotFoundException` | 404 | об'єкт не знайдено |
| `UnauthorizedAccessException` | 403 | чужий об'єкт або бракує прав |

`ErrorHandlingMiddleware` перетворює їх на JSON. Новий код помилки з БД — додайте текст у словник `DbErrors.Messages`
(`DAL/Infrastructure/BusinessRuleException.cs`). Для операцій, що пишуть у БД, обгортайте збереження в `DbErrors.Run(…)`.

## Аудит і SESSION_CONTEXT

Тригер `TR_Project_StatusChange` пише в `AuditLog` і створює сповіщення, беручи користувача з `SESSION_CONTEXT(N'UserId')`.
`SessionContextInterceptor` (EF) і `SqlConnectionFactory` (ADO.NET) викликають `sp_set_session_context` щойно з'єднання відкрито —
окремо нічого робити не треба. Інші події пишіть через `IAuditRepository.WriteAsync`.

## Як додати функцію

1. **Дані.** Якщо потрібна нова колонка чи таблиця — спершу скрипт у `db/`, потім перегенерація моделі (нижче).
2. **Репозиторій.** Метод в інтерфейсі (`Interfaces.cs`) і реалізація; результат — модель читання, не сутність.
3. **Сервіс.** Логіка й перевірки; помилки — `BusinessRuleException` з українським текстом.
4. **DTO і контролер.** Атрибути валідації з українськими `ErrorMessage`; XML-коментар `<summary>` — він потрапляє у Swagger.
5. **Клієнт.** Тип у `api/types.ts`, сторінка в `pages/`, маршрут у `App.tsx`, пункт меню в `components/AppLayout.tsx`,
   тема довідки в `help/topics.ts` і `help="…"` у `PageTitle`.
6. **Переклад.** Усі рядки інтерфейсу — через `t('Український текст')`; переклад — у `locales/en.ts`
   (ключ — сам український рядок; без перекладу показується українська).
7. **Тест** у `CivicBudget.Tests`.

## Перегенерація моделі (Database First)

```powershell
cd backend
dotnet tool restore
dotnet ef dbcontext scaffold "Server=.\SQLEXPRESS;Database=CivicBudget;Trusted_Connection=True;TrustServerCertificate=True;" `
  Microsoft.EntityFrameworkCore.SqlServer --project CivicBudget.DAL --output-dir Entities `
  --context CivicBudgetContext --context-dir . --no-onconfiguring --force
```

Згенерований код (`Entities/`, `CivicBudgetContext.cs`) вручну не редагуйте — розширюйте через `partial`.

## Автентифікація

JWT: access 15 хв (з ролями), refresh 7 днів (`typ=refresh`). Клієнт (`api/client.ts`) сам оновлює токени після 401.
Ролі — коди з `AppRole.Code` (`Auth/Roles`). 2FA: `AuthService.LoginAsync` повертає `requiresTwoFactor` і `challengeId`,
код перевіряє `POST /api/auth/2fa`.

## Якість коду

```powershell
cd backend;  dotnet build; dotnet format; dotnet test
cd frontend; npm run lint; npm run format; npm run build
```

Стиль — `.editorconfig`, Prettier (`frontend/.prettierrc`). Коментарі пояснюють «чому», а не «що»; XML-коментарі — на публічному API.
Повідомлення комітів: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`.
