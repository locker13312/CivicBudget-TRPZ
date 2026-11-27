# Технології і версії

## Середовище

| Компонент | Версія | Призначення |
|---|---|---|
| Windows | 10 Pro 64-bit | ОС розробки й демонстрації |
| MS SQL Server | 2022 Express (`.\SQLEXPRESS`) | СКБД, БД `CivicBudget` |
| SQL Server Management Studio | — | Діаграма БД, виконання скриптів |
| .NET SDK | 8.0.428 (цільова платформа `net8.0`) | бекенд і тести |
| Node.js | 24.16 | збірка фронтенду |
| Visual Studio 2022 / VS Code | — | редактор коду |
| Google Chrome | — | перевірка інтерфейсу |

## Бекенд (NuGet)

| Пакет | Версія | Проєкт | Для чого |
|---|---|---|---|
| Microsoft.EntityFrameworkCore.SqlServer | 8.0.11 | DAL | EF Core, провайдер SQL Server |
| Microsoft.EntityFrameworkCore.SqlServer.NetTopologySuite | 8.0.11 | DAL | тип `geography` (Project.Location) |
| Microsoft.EntityFrameworkCore.Tools / .Design | 8.0.11 | DAL, Api | `Scaffold-DbContext` (Database First) |
| Microsoft.Data.SqlClient | транзитивно з EF Core | DAL | ADO.NET: `SqlConnection`, `SqlCommand`, `SqlDataReader`, `SqlDataAdapter` |
| Microsoft.AspNetCore.Authentication.JwtBearer | 8.0.11 | Api | JWT (access 15 хв, refresh 7 днів) |
| BCrypt.Net-Next | 4.2.0 | Api | хеші паролів |
| Swashbuckle.AspNetCore | 6.6.2 | Api | Swagger / OpenAPI 3 |
| QuestPDF | 2024.10.4 | Api | звіти PDF |
| ClosedXML | 0.104.2 | Api | звіти XLSX |
| xunit / xunit.runner.visualstudio | 2.5.3 | Tests | модульні й інтеграційні тести |
| NSubstitute | 5.3.0 | Tests | підміна репозиторіїв у тестах сервісів |
| Microsoft.NET.Test.Sdk | 17.8.0 | Tests | запуск тестів |

Вбудовані засоби ASP.NET Core 8: SignalR (результати в реальному часі), RateLimiter (обмеження частоти входу),
IMemoryCache (коди 2FA), BackgroundService (імітація розсилки e-mail).

## Фронтенд (npm)

| Пакет | Версія | Для чого |
|---|---|---|
| react, react-dom | 18.3.1 | інтерфейс |
| typescript | 5.8.3 | типізація |
| vite, @vitejs/plugin-react | 6.4.6, 4.7.0 | збірка і dev-сервер (HTTPS) |
| antd, @ant-design/icons | 5.22.7, 5.5.2 | компоненти інтерфейсу й іконки |
| @fontsource/inter | 5.1.1 | шрифт з кирилицею (локально) |
| react-router-dom | 6.30.6 | маршрути між формами |
| i18next, react-i18next | 24.2.0, 15.4.0 | українська й англійська |
| leaflet, react-leaflet | 1.9.4, 4.2.1 | карта OpenStreetMap |
| recharts | 2.15.0 | діаграми статистики |
| @microsoft/signalr | 11.0.0 | клієнт SignalR |
| dayjs | 1.11.13 | дати у формах |
| eslint, typescript-eslint, eslint-plugin-react-hooks | 9.39.5, 8.74.0, 5.2.0 | перевірка коду |
| prettier | 3.10.1 | форматування |

## Скрипти БД

| Файл | Що робить |
|---|---|
| `db/CivicBudget_create.sql` | 20 таблиць, обмеження, індекси, 3 представлення, 2 тригери, 2 процедури (дослівно з документа «Проєктування БД») |
| `db/CivicBudget_v2_extensions.sql` | функції `fn_RemainingVotes`, `fn_CategoryBudgetBalance` (схема таблиць не змінюється) |
| `db/CivicBudget_demo.sql` | демо-дані й перевірка 6 порушень правил |
| `db/defense_demo.sql` | показ об'єктів БД на захисті без зміни даних |
| `db/reset.ps1` (`reset.bat`) | create → extensions → demo, копіювання демо-файлів |
