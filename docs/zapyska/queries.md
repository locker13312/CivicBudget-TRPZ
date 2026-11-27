# Фільтри, запити, звіти

Розділ відповідає методичці (р. 3): (а) звіти з вихідною інформацією, (б) результати фільтрації, (в) результати запитів.
Кожен звіт експортується в PDF, XLSX і CSV з однаковою шапкою: назва ІС, кампанія, дата формування, хто сформував.

## Фільтри

| Форма | Умови фільтра | Як реалізовано |
|---|---|---|
| Каталог проєктів (і карта) | текст (назва, опис, номер GB-…), кампанія, категорія, район, вартість від/до; сортування: за голосами, вартістю ↑↓, новизною, назвою; сторінки по 9 | LINQ з лямбдами `Where(p => …)`, `OrderBy/ThenBy`, `Skip/Take` → `OFFSET … FETCH NEXT` (`ProjectRepository.Filtered`, `SearchAsync`); карта — ті самі фільтри + `Location != null` |
| Голосування | назва або номер, категорія | фільтр у браузері над бюлетенем мешканця |
| Журнал аудиту | період, користувач (ПІБ або e-mail), дія, об'єкт; сторінки по 20 | параметризований SQL з `OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY`, ADO.NET `SqlDataAdapter` → `DataSet` → `DataView` (`AuditRepository`) |
| Користувачі й ролі | ПІБ або e-mail; сторінки по 15 | LINQ `Where(u => u.LastName.Contains(s) …)` + `Skip/Take` |
| Оператор: пошук виборця | ПІБ (частина) + дата народження | SQL `LIKE` + `BirthDate = @BirthDate`, у результаті — спосіб голосування й `fn_RemainingVotes` (`FunctionRepository.FindVotersAsync`) |
| Результати, статистика, кампанія | вибір кампанії (архів минулих) | параметр `campaignId` |
| Хід реалізації | кампанія | LINQ над `vw_ImplementationProgress` |

## Запити

| Запит | Де | Техніка |
|---|---|---|
| Результати голосування за категоріями | `ProjectRepository.GetResultsAsync` | LINQ, синтаксис запитів: `from … join … join … orderby … select` над `vw_ProjectResult` |
| Статистика за категоріями | `StatisticsRepository.GetByCategoryAsync` | `from … join … group … by … into`, left join `join … into … DefaultIfEmpty()` |
| Статистика за районами, за статусами | `StatisticsRepository` | `group … by … into`, агрегати `Count`, `Sum` |
| Освоєння бюджету (план/факт) | `StatisticsRepository.GetBudgetUsageAsync` | агрегати над `vw_ImplementationProgress` |
| Схожі проєкти (можливі дублікати) | `ProjectRepository.FindSimilarAsync` | ключові слова назви й опису, кількість спільних слів |
| Залишок голосів виборця | `FunctionRepository.GetRemainingVotesAsync` | `SELECT dbo.fn_RemainingVotes(@VoterId, @CampaignId)` |
| Бюджет категорій після відбору | `FunctionRepository.GetCategoryBalanceAsync` | `SELECT … FROM dbo.fn_CategoryBudgetBalance(@CampaignId)` |
| Рейтинг переможців | `ProcedureRepository.SelectWinnersAsync` | `EXEC usp_SelectWinners`, читання `SqlDataReader` |
| Подання проєкту | `ProcedureRepository.SubmitProjectAsync` | `EXEC usp_SubmitProject`, перевірки 50010–50015 у процедурі |
| Історія статусів проєкту | `AuditRepository.GetProjectStatusHistoryAsync` | `AuditLog` з `ActionCode = 'project_status'` (пише тригер) |

## Звіти (меню «Адміністрування → Звіти», кнопки «Експорт» на формах)

| Вид | Звіт | Ендпоінт | Хто бачить |
|---|---|---|---|
| (а) вихідна інформація | Картка проєкту: опис, кошторис, голоси, рішення | `GET /api/reports/project/{id}` | усі |
| (а) | Перелік переможців кампанії | `GET /api/reports/winners` | усі |
| (а) | Хід реалізації (усі картки або одна) | `GET /api/reports/implementation` | усі |
| (б) результати фільтрації | Каталог за поточним фільтром; умови фільтра — у шапці звіту | `GET /api/reports/catalog` | усі |
| (в) результати запитів | Результати голосування за кампанією | `GET /api/reports/results` | усі |
| (в) | Зведена статистика кампанії (категорії, райони, статуси, бюджет) | `GET /api/reports/statistics` | адміністратор |

Параметр `format=pdf | xlsx | csv`. PDF формує QuestPDF, XLSX — ClosedXML, CSV — UTF-8 з BOM (відкривається в Excel з кирилицею).

## Відкриті дані (задача 22, ДП-23)

| Набір | Ендпоінт | Формати |
|---|---|---|
| Перелік наборів | `GET /api/open-data` | JSON |
| Проєкти (опубліковані й далі) | `GET /api/open-data/projects` | JSON, CSV |
| Результати голосування кампанії | `GET /api/open-data/results` | JSON, CSV; проміжні голоси приховано, якщо кампанія їх не показує |

Персональних даних у відкритих наборах немає: лише проєкти, суми й агреговані голоси.
