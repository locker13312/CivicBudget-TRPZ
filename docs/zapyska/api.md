# Перелік ендпоінтів API

REST/JSON, OpenAPI 3 (Swagger: https://localhost:7080/swagger). Усього: **81** операцій у 17 контролерах.
Доступ за ролями перевіряє атрибут `[Authorize(Roles = …)]`; ролі — з таблиць AppRole/UserRole, передаються в JWT.
Помилки — JSON `{ "message": "…", "code": 50003 }`: 400 — порушення правила (зокрема 50001–50020 з БД), 401 — потрібен вхід,
403 — немає прав, 404 — не знайдено.

## Автентифікація (`AuthController`)

Доступ: усі (вхід, реєстрація, 2FA).

| Метод | Шлях | Призначення | Параметри |
|---|---|---|---|
| POST | `/api/auth/2fa` | Другий крок входу: одноразовий код із листа (mail-outbox/). | — |
| POST | `/api/auth/2fa/resend` | Надіслати код 2FA ще раз (не частіше, ніж раз на 30 секунд). | — |
| POST | `/api/auth/bankid-demo` | Демо-BankID: вхід без пароля від імені обраної особи. | — |
| GET | `/api/auth/bankid-demo/users` | Демо-BankID: список осіб, від імені яких можна «увійти через банк». | — |
| GET | `/api/auth/identity-demo/persons` | Імітація BankID / Дія.Підпис для реєстрації: тестові дані осіб, які «повертає банк». | — |
| POST | `/api/auth/login` | Вхід за e-mail і паролем. | — |
| GET | `/api/auth/me` | Поточний користувач: ПІБ, ролі, стан верифікації. | — |
| POST | `/api/auth/refresh` | Нова пара токенів за refresh-токеном (7 днів). | — |
| POST | `/api/auth/register` | Реєстрація мешканця з перевіркою міста й віку. | — |

## Довідники (`ReferenceController`)

Доступ: усі.

| Метод | Шлях | Призначення | Параметри |
|---|---|---|---|
| GET | `/api/reference` | Довідники: категорії, райони, пункти голосування, ролі. | — |

## Кампанії й результати (`CampaignsController`)

Доступ: усі.

| Метод | Шлях | Призначення | Параметри |
|---|---|---|---|
| GET | `/api/campaigns` | Усі кампанії (архів минулих і поточна). | — |
| GET | `/api/campaigns/current` | Поточна кампанія з етапами та лімітами категорій. | — |
| GET | `/api/campaigns/results` | Результати голосування (уявлення vw_ProjectResult). | campaignId |
| GET | `/api/campaigns/{id}` | Кампанія з етапами, правилами голосування й лімітами категорій. | id |
| GET | `/api/campaigns/{id}/rating` | Підсумковий рейтинг кампанії (після визначення переможців): причина відбору кожного проєкту і залишок бюджету категорій (fn_CategoryBudgetBalance). Відкрита інформація за ТЗ ч.1 п.3.2. | id |

## Каталог і картка проєкту (`ProjectsController`)

Доступ: усі; підписка й історія — після входу.

| Метод | Шлях | Призначення | Параметри |
|---|---|---|---|
| GET | `/api/projects` | Каталог з пошуком, фільтрами (категорія, район, вартість), сортуванням і сторінками. | CampaignId, Search, CategoryId, DistrictId, MinCost, MaxCost, Status, Sort, Page, PageSize |
| GET | `/api/projects/map` | Проєкти на карті (ті самі фільтри, що й каталог). | CampaignId, Search, CategoryId, DistrictId, MinCost, MaxCost, Status, Sort, Page, PageSize |
| GET | `/api/projects/{id}` | Картка проєкту: опис, кошторис, голоси, рецензії, вкладення, точка на карті. | id |
| GET | `/api/projects/{id}/history` | Історія статусів проєкту з журналу аудиту — для автора і працівників. | id |
| DELETE | `/api/projects/{id}/subscription` | Відписатися від сповіщень про проєкт. | id |
| GET | `/api/projects/{id}/subscription` | Чи стежить поточний користувач за проєктом. | id |
| PUT | `/api/projects/{id}/subscription` | Підписатися на зміни статусу проєкту. | id |

## Сповіщення (`NotificationsController`)

Доступ: будь-який користувач після входу.

| Метод | Шлях | Призначення | Параметри |
|---|---|---|---|
| GET | `/api/notifications` | Останні сповіщення користувача (створює тригер TR_Project_StatusChange). | — |
| POST | `/api/notifications/read-all` | Позначити всі сповіщення прочитаними. | — |
| GET | `/api/notifications/unread-count` | Кількість непрочитаних сповіщень (лічильник у шапці). | — |
| POST | `/api/notifications/{id}/read` | Позначити сповіщення прочитаним. | id |

## Автор: мої проєкти (`MyProjectsController`)

Доступ: мешканець (автор).

| Метод | Шлях | Призначення | Параметри |
|---|---|---|---|
| GET | `/api/my/projects` | Усі проєкти автора з поточними статусами й коментарем модератора. | — |
| POST | `/api/my/projects` | Створити чернетку. | — |
| POST | `/api/my/projects/similar` | Схожі проєкти поточної кампанії (попередження про можливий дублікат). | — |
| GET | `/api/my/projects/{id}` | Проєкт автора для редагування: чи можна змінювати і коментар доопрацювання. | id |
| PUT | `/api/my/projects/{id}` | Зберегти чернетку (або проєкт на доопрацюванні). | id |
| POST | `/api/my/projects/{id}/attachments` | Додати вкладення (JPG, PNG, PDF до 20 МБ) до чернетки або проєкту на доопрацюванні. | id |
| DELETE | `/api/my/projects/{id}/attachments/{attachmentId}` | Видалити вкладення з чернетки або проєкту на доопрацюванні. | id, attachmentId |
| POST | `/api/my/projects/{id}/submit` | Подати проєкт — виклик usp_SubmitProject через ADO.NET. | id |

## Модерація (`ModerationController`)

Доступ: модератор.

| Метод | Шлях | Призначення | Параметри |
|---|---|---|---|
| GET | `/api/moderation/queue` | Черга модерації: подані, на модерації, допущені до публікації; перелік модераторів. | — |
| POST | `/api/moderation/{id}/assign` | Призначити відповідального модератора. | id |
| POST | `/api/moderation/{id}/decision` | Рішення: approve (допустити) | revise (на доопрацювання) | reject (відхилити) | expertise (на експертизу). | id |
| POST | `/api/moderation/{id}/publish` | Опублікувати допущений проєкт — він з’являється в каталозі й бере участь у голосуванні. | id |
| GET | `/api/moderation/{id}/similar` | Схожі проєкти — кандидати в дублікати. | id |

## Експертиза (`ExpertiseController`)

Доступ: експерт.

| Метод | Шлях | Призначення | Параметри |
|---|---|---|---|
| GET | `/api/expertise` | Проєкти, передані на експертизу. | — |
| POST | `/api/expertise/{id}/conclusion` | Висновок експерта: вид (technical / legal / financial) і рішення. | id |

## Голосування (`VotingController`)

Доступ: мешканець.

| Метод | Шлях | Призначення | Параметри |
|---|---|---|---|
| GET | `/api/voting/my` | Мій бюлетень: проєкти, мої голоси, скільки лишилось. | — |
| POST | `/api/voting/{projectId}` | Віддати голос за проєкт (+1). Правила перевіряє тригер TR_Vote_CheckRules. | projectId |

## Оператор: паперові бюлетені (`OperatorController`)

Доступ: оператор.

| Метод | Шлях | Призначення | Параметри |
|---|---|---|---|
| POST | `/api/operator/ballots` | Внести паперовий бюлетень: виборець, пункт, голоси за проєкти (правила перевіряє тригер). | — |
| GET | `/api/operator/voters` | Пошук виборця за ПІБ і датою народження (ПЦ-14, ДП-08). Разом із даними особи повертається, чи голосував він уже в поточній кампанії і скільки голосів лишилось (fn_RemainingVotes). | name, birthDate |

## Адміністрування (`AdminController`)

Доступ: адміністратор.

| Метод | Шлях | Призначення | Параметри |
|---|---|---|---|
| GET | `/api/admin/audit` | Журнал аудиту — ADO.NET, SqlDataAdapter + DataTable, OFFSET … FETCH NEXT. | From, To, User, Action, Entity, Page, PageSize |
| GET | `/api/admin/audit/filters` | Значення для фільтрів журналу: коди дій і назви об'єктів. | — |
| POST | `/api/admin/campaigns` | Створити кампанію (етап «Підготовка») з параметрами й лімітами категорій. | — |
| PUT | `/api/admin/campaigns/{id}` | Змінити параметри кампанії, строки етапів і ліміти категорій. | id |
| GET | `/api/admin/campaigns/{id}/rating` | Рейтинг кампанії з причинами відбору і залишком категорій (fn_CategoryBudgetBalance). | id |
| POST | `/api/admin/campaigns/{id}/select-winners` | Визначити переможців — usp_SelectWinners (ADO.NET, SqlDataReader). | id |
| POST | `/api/admin/campaigns/{id}/status` | Перемкнути етап: draft, submission, review, voting, counting, implementation, closed. | id |
| GET | `/api/admin/campaigns/{id}/status-check` | Що станеться при перемиканні етапу: дозволено чи ні, наслідки, попередження. | id, to |
| GET | `/api/admin/statistics` | Зведена статистика (LINQ, синтаксис запитів з join … group … into). | campaignId |
| GET | `/api/admin/users` | Користувачі з пошуком і сторінками; перегляд записується в журнал як доступ до персональних даних. | search, page, pageSize |
| PUT | `/api/admin/users/{id}/block` | Заблокувати або розблокувати користувача. | id |
| PUT | `/api/admin/users/{id}/roles` | Призначити ролі користувачу (RBAC, таблиця UserRole). | id |
| PUT | `/api/admin/users/{id}/two-factor` | Увімкнути / вимкнути двофакторну автентифікацію (UserAccount.TwoFactorEnabled). | id |

## Файли (`FilesController`)

Доступ: усі для опублікованих; непублічні — власник і працівники.

| Метод | Шлях | Призначення | Параметри |
|---|---|---|---|
| GET | `/api/files/{id}` | Файл вкладення (фото, PDF); непублічні файли — лише власнику й працівникам. | id |

## Хід реалізації (публічно) (`ImplementationsController`)

Доступ: усі.

| Метод | Шлях | Призначення | Параметри |
|---|---|---|---|
| GET | `/api/implementations` | Хід реалізації проєктів-переможців: план/факт з vw_ImplementationProgress. | campaignId |
| GET | `/api/implementations/{id}` | Картка реалізації: етапи, план/факт, прийняті звіти виконавця. | id |

## Кабінет виконавця (`ExecutorController`)

Доступ: виконавець.

| Метод | Шлях | Призначення | Параметри |
|---|---|---|---|
| GET | `/api/executor/implementations` | Картки реалізації підрядника, до якого прив’язано виконавця. | — |
| GET | `/api/executor/implementations/{id}` | Картка реалізації для виконавця: етапи і всі його звіти. | id |
| PUT | `/api/executor/stages/{stageId}` | Змінити статус етапу; «виконано» — лише з фактичними витратами. | stageId |
| POST | `/api/executor/stages/{stageId}/reports` | Звіт про етап: текст + до 10 фото/PDF (multipart/form-data). | stageId |

## Адміністратор: реалізація (`AdminImplementationsController`)

Доступ: адміністратор.

| Метод | Шлях | Призначення | Параметри |
|---|---|---|---|
| GET | `/api/admin/implementations` | Усі картки реалізації з кількістю звітів, що чекають на розгляд. | — |
| POST | `/api/admin/implementations` | Створити картку реалізації для переможця: підрядник, бюджет, строки, етапи. | — |
| GET | `/api/admin/implementations/new` | Дані для форми нової картки: переможці без реалізації і підрядники. | — |
| GET | `/api/admin/implementations/reports/pending` | Звіти виконавців, що чекають на прийняття. | — |
| POST | `/api/admin/implementations/reports/{reportId}/review` | Прийняти (accepted) або відхилити (rejected, з коментарем) звіт виконавця. | reportId |
| GET | `/api/admin/implementations/{id}` | Картка реалізації для адміністратора. | id |
| POST | `/api/admin/implementations/{id}/status` | Змінити статус реалізації; «завершено» — коли всі етапи виконано. | id |

## Звіти (PDF, XLSX, CSV) (`ReportsController`)

Доступ: усі; статистика — адміністратор.

| Метод | Шлях | Призначення | Параметри |
|---|---|---|---|
| GET | `/api/reports/catalog` | (б) Каталог за поточним фільтром; умови фільтра — у шапці звіту. | CampaignId, Search, CategoryId, DistrictId, MinCost, MaxCost, Status, Sort, Page, PageSize, format |
| GET | `/api/reports/implementation` | (а) Хід реалізації: усі картки або одна (implementationId). | implementationId, campaignId, format |
| GET | `/api/reports/project/{id}` | (а) Картка проєкту. | id, format |
| GET | `/api/reports/results` | (в) Результати голосування за кампанією. | campaignId, format |
| GET | `/api/reports/statistics` | (в) Зведена статистика кампанії — лише адміністратор. | campaignId, format |
| GET | `/api/reports/winners` | (а) Перелік переможців кампанії. | campaignId, format |

## Відкриті дані (`OpenDataController`)

Доступ: усі (відкриті дані).

| Метод | Шлях | Призначення | Параметри |
|---|---|---|---|
| GET | `/api/open-data` | Перелік наборів даних. | — |
| GET | `/api/open-data/projects` | Проєкти (опубліковані й далі). format = json | csv. | campaignId, format |
| GET | `/api/open-data/results` | Результати голосування кампанії (з урахуванням приховування проміжних результатів). | campaignId, format |

## SignalR

| Хаб | Подія | Призначення |
|---|---|---|
| `/hubs/results` | `votesChanged(projectId)` | Сторінки результатів, каталогу й картки оновлюють лічильники голосів у реальному часі (0 — оновити все). |
