# Трасування вимог ТЗ

Відповідність задач технічного завдання (ТЗ ч.1 п.4.2) і прецедентів (ПЦ, ДП) реалізації: екран → ендпоінт API → об'єкт БД.
Скріни — у [screens/](screens/), повний опис ендпоінтів — у Swagger (`/swagger`).

## Функціональні задачі

| Задача ТЗ | Прецеденти | Екран | Ендпоінти | Об'єкти БД |
|---|---|---|---|---|
| 1–2. Реєстрація з підтвердженням особи (BankID / Дія.Підпис — імітація), перевірка віку й міста | ПЦ-04, ДП-03…ДП-06 | Реєстрація ([12](screens/12_register_bankid.png)), Вхід ([11](screens/11_login.png)) | `GET /api/auth/identity-demo/persons`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/bankid-demo` | `UserAccount` (BirthDate, RegAddress, DistrictId, IdentityHash, Verification*), `UserRole` |
| 3. Ролі (RBAC), призначення й зняття ролей, блокування | ПЦ-17 | Користувачі й ролі ([45](screens/45_admin_users.png)) | `GET /api/admin/users`, `PUT /api/admin/users/{id}/roles`, `PUT /api/admin/users/{id}/block` | `AppRole`, `UserRole`, `UserAccount.IsBlocked` |
| 4–6. Проєкт: опис, кошторис, вкладення, точка на карті, чернетки, подання | ПЦ-08, ДП-09…ДП-12, ДП-14 | Мої проєкти ([13](screens/13_my_projects.png)), Форма проєкту ([14](screens/14_project_form_revision.png)), подання ([15](screens/15_project_submitted.png), [16](screens/16_project_submit_error_50012.png)) | `GET/POST/PUT /api/my/projects[/{id}]`, `POST /api/my/projects/{id}/attachments`, `POST /api/my/projects/{id}/submit` | `Project` (Location — geography), `BudgetItem`, `Attachment`, `vw_ProjectCost`, `usp_SubmitProject` (50010–50015) |
| 7. Попередження про схожий проєкт, позначка дубліката | ДП-13 | Форма проєкту, Перевірка модератора ([18](screens/18_moderation_review.png)) | `POST /api/my/projects/similar`, `GET /api/moderation/{id}/similar`, `POST /api/moderation/{id}/decision` (`duplicate`) | `Project.DuplicateOfId`, `Review` |
| 8–12. Черга модератора, призначення модератора, повернення з коментарем, експертиза, допуск / відхилення, публікація | ПЦ-11, ПЦ-12, ПЦ-13, ДП-15…ДП-17 | Модерація ([17](screens/17_moderation_queue.png), [19](screens/19_moderation_deadlines.png), [20](screens/20_moderation_ready.png)), Експертиза ([22](screens/22_expertise_list.png), [23](screens/23_expertise_conclusion.png)) | `GET /api/moderation/queue`, `POST /api/moderation/{id}/assign` (вручну або автоматично за завантаженістю — задача 9), `POST /api/moderation/{id}/decision`, `POST /api/moderation/{id}/publish`, `GET /api/expertise`, `POST /api/expertise/{id}/conclusion` | `Project.ModeratorId`, `Project.Status`, `Project.SubmittedAt` (строк 10 робочих днів, ТЗ ч.2 п.2.1), `Review` (CK_Review_Comment), `TR_Project_StatusChange`; власний проєкт модератор чи експерт не розглядає |
| 13. Каталог: пошук, фільтри (категорія, район, вартість), сортування, сторінки, карта | ПЦ-01, ДП-01, ДП-02 | Каталог ([02](screens/02_catalog.png), [03](screens/03_catalog_filtered.png), [04](screens/04_catalog_map.png)), Картка ([05](screens/05_project_card.png)) | `GET /api/projects` (Skip/Take → OFFSET…FETCH), `GET /api/projects/map`, `GET /api/projects/{id}` | `Project`, `vw_ProjectCost`, `Category`, `District` |
| 14–16. Онлайн-голосування, паперові бюлетені, підрахунок у реальному часі, проміжні результати за параметром кампанії | ПЦ-06, ПЦ-14, ДП-07, ДП-08, ПЦ-02 | Голосування ([25](screens/25_voting_error_50003.png), [28](screens/28_voting_error_50002.png)), Паперовий бюлетень ([29](screens/29_operator_search.png), [30](screens/30_operator_voted_online.png), [31](screens/31_operator_ballot.png), [32](screens/32_operator_ballot_done.png)), Результати ([06](screens/06_results.png)) | `GET /api/voting/my`, `POST /api/voting/{projectId}`, `GET /api/operator/voters`, `POST /api/operator/ballots`, `GET /api/campaigns/results`, SignalR `/hubs/results` (`votesChanged`) | `Vote`, `TR_Vote_CheckRules` (50001–50005), `fn_RemainingVotes` (залишок голосів, стан виборця для оператора), `vw_ProjectResult`, `Campaign.ShowInterimResults` (приховування голосів скрізь), `PollingStation` |
| 17. Визначення переможців, таблиця рейтингу | ПЦ-18, ДП-20, ДП-21 | Кампанія ([39](screens/39_admin_winners.png)), Результати ([40](screens/40_results_winners.png), [41](screens/41_results_selection.png)) | `POST /api/admin/campaigns/{id}/select-winners`, `GET /api/admin/campaigns/{id}/rating`, `GET /api/campaigns/{id}/rating` | `usp_SelectWinners` (ADO.NET, SqlDataReader), `fn_CategoryBudgetBalance`, `CampaignCategory.BudgetLimit`; причина відбору й правило рівності голосів |
| 18–19. Картка реалізації, кабінет виконавця, звіти з фото, прийняття звітів, хід реалізації (план / факт) | ПЦ-19, ПЦ-15, ДП-22, ПЦ-03 | Хід реалізації ([07](screens/07_implementation_list.png), [08](screens/08_implementation_card.png)), Кабінет виконавця ([33](screens/33_executor_cabinet.png)), Реалізація ([44](screens/44_admin_implementation.png)) | `GET /api/implementations[/{id}]`, `GET /api/executor/implementations[/{id}]`, `PUT /api/executor/stages/{id}`, `POST /api/executor/stages/{id}/reports`, `POST /api/admin/implementations`, `POST /api/admin/implementations/reports/{id}/review`, `POST /api/admin/implementations/{id}/status` | `Implementation`, `ImplementationStage`, `Report`, `Attachment`, `vw_ImplementationProgress` |
| 20. Підписки й сповіщення; e-mail — імітація (файли в `mail-outbox/`) | ПЦ-07, ДП-18 | Картка проєкту («Стежити»), Сповіщення ([27](screens/27_notifications.png)) | `PUT/DELETE /api/projects/{id}/subscription`, `GET /api/notifications`, `POST /api/notifications/{id}/read` | `Subscription`, `Notification` (Channel, SentAt), `TR_Project_StatusChange` |
| 21. Зведені звіти й статистика (проєкти, учасники, голоси, освоєння бюджету), діаграми | ПЦ-20 | Статистика ([42](screens/42_admin_statistics.png)) | `GET /api/admin/statistics`, `GET /api/reports/statistics` | LINQ `join … group … by … into` над `vw_ProjectResult`, `vw_ImplementationProgress` |
| 22. Відкриті дані (JSON, CSV) | ДП-23 | Відкриті дані ([09](screens/09_open_data.png)) | `GET /api/open-data`, `GET /api/open-data/projects`, `GET /api/open-data/results` | `vw_ProjectResult`, `vw_ProjectCost` |
| 23. Налаштування кампанії: строки етапів, бюджет і ліміти категорій, правила голосування, перемикання етапів | ПЦ-16, ДП-19 | Кампанія ([35](screens/35_admin_campaign.png), [36](screens/36_admin_stage_blocked.png), [37](screens/37_admin_stage_confirm.png)) | `POST /api/admin/campaigns`, `PUT /api/admin/campaigns/{id}`, `GET /api/admin/campaigns/{id}/status-check`, `POST /api/admin/campaigns/{id}/status` (лише по черзі; назад — лише до підрахунку) | `Campaign` (CK_Campaign_Dates, CK_Campaign_Votes), `CampaignCategory` |
| 24. Журнал аудиту з фільтрами (період, користувач, дія, об'єкт) | — | Журнал аудиту ([46](screens/46_admin_audit.png)) | `GET /api/admin/audit`, `GET /api/admin/audit/filters` | `AuditLog` (ADO.NET: SqlDataAdapter → DataTable → DataView, OFFSET…FETCH) |
| ТЗ ч.2 п.3.2. Експорт у PDF, XLSX, CSV; архів минулих кампаній | — | Звіти ([43](screens/43_admin_reports.png)), кнопки «Експорт», вибір кампанії в Результатах | `GET /api/reports/{project,winners,implementation,catalog,results,statistics}?format=pdf\|xlsx\|csv` | — |

## Нефункціональні вимоги

| Вимога | Джерело | Реалізація |
|---|---|---|
| HTTPS, JWT (access 15 хв / refresh 7 днів), bcrypt, ролі на кожному ендпоінті | ТЗ ч.1 п.4.6 | dev-сертифікат ASP.NET Core; `JwtTokenService`; `BCrypt.Net-Next`; `[Authorize(Roles = …)]` |
| Обмеження частоти запитів, параметризовані запити, захисні заголовки (CSP) | ТЗ ч.1 п.4.6 | вбудований `RateLimiter`; EF Core і `SqlParameter`; `SecurityHeadersMiddleware`, CSP у зібраному клієнті |
| Запис доступу до персональних даних у журнал | ТЗ ч.1 п.4.6 | `pd_view` в `AuditLog` (список користувачів, пошук виборця) |
| Блокування після 5 невдалих входів | ТЗ ч.2 п.3.3 | `AuthService`, `UserAccount.IsBlocked`, подія `user_autoblock` |
| Двофакторна автентифікація для модератора, експерта, адміністратора | ТЗ ч.2 п.3.3 | обов'язкова для цих ролей незалежно від позначки; одноразовий код листом (`mail-outbox/`), повторне надсилання через 30 с; `UserAccount.TwoFactorEnabled` ([34](screens/34_login_2fa.png)) |
| Інтерфейс українською з перемикачем на англійську | ТЗ ч.1 п.4.8 | i18next, `frontend/src/locales/en.ts` |
| Адаптивний інтерфейс (телефон — ноутбук) | ТЗ ч.2 п.3.2 | сітка й `Drawer`-меню Ant Design ([48](screens/48_mobile_catalog.png), [m5](screens/m5_mobile_voting.png), [m3](screens/m3_mobile_project.png)) |
| Карта OpenStreetMap | ТЗ ч.1 п.4.8 | Leaflet, `Project.Location` (geography, NetTopologySuite) |
| Ant Design | ТЗ ч.2 п.2.2 | Ant Design 5, власна тема (`frontend/src/theme.ts`) |
| Оновлення в реальному часі | ТЗ ч.2 п.2.4 | SignalR замість «сирого» WebSocket — див. [ADR 0001](adr/0001-stack.md) |
| Swagger з описом ендпоінтів; ESLint + Prettier | ТЗ ч.2 п.2.6 | Swashbuckle (XML-коментарі), `npm run lint`, `npm run format` |
| Тестування | силабус | 46 тестів xUnit: `CivicBudget.Tests` (правила сервісів, правила БД і функції, експорт) |

## Вимоги методички до пояснювальної записки

| Вимога | Реалізація |
|---|---|
| Фільтри, запити, звіти: (а) вихідна інформація, (б) результати фільтрації, (в) результати запитів | сторінка «Звіти» ([43](screens/43_admin_reports.png)): картка проєкту, переможці, хід реалізації / каталог за фільтром з умовами в шапці / результати голосування, статистика |
| Головне й спливаючі меню | меню за ролями; меню користувача в шапці; контекстне меню «⋯» у таблицях модерації, користувачів, реалізації |
| Форми й переходи | окрема форма на кожну задачу, маршрути в `frontend/src/App.tsx` |
| Довідкова система | сторінка «Довідка» з розділами за ролями ([10](screens/10_help.png)), кнопка «?» на кожній формі ([47](screens/47_help_drawer.png)), підказки на полях |
| Інструкції | [user-guide](user-guide.md), [programmer-guide](programmer-guide.md), [sysadmin-guide](sysadmin-guide.md), [dba-guide](dba-guide.md) |
| Лекції 7–8: Database First, DAL, LINQ, ADO.NET, OFFSET…FETCH | таблиця «Де в коді техніки доступу до даних» у [README](../README.md), фрагменти — [zapyska/code.md](zapyska/code.md) |
| Об'єкти БД з лекції 6 (функції) | `db/CivicBudget_v2_extensions.sql`: `fn_RemainingVotes`, `fn_CategoryBudgetBalance`; показ — `db/defense_demo.sql` |

## Свідомо не реалізовано (для аркуша змін до ТЗ)

Етап промислового розгортання, обґрунтування — у [ADR 0001](adr/0001-stack.md):
Docker / Kubernetes, CI, Redis, MinIO, черги, Nginx, моніторинг (Prometheus / Grafana), навантажувальне тестування й pen-testing,
push-сповіщення (FCM / APNs), справжні BankID і Дія.Підпис, справжній SMTP.
