# Інструкція системного адміністратора

## Вимоги

| Компонент | Версія |
|---|---|
| ОС | Windows 10/11 або Windows Server 2019+ |
| SQL Server | 2022 Express або вище, екземпляр `SQLEXPRESS` |
| .NET | SDK 8 (для збірки) або ASP.NET Core Runtime 8 (для запуску зібраної версії) |
| Node.js | 18+ (лише для збирання клієнта) |
| Браузер | актуальні Chrome, Edge, Firefox |

## Встановлення на стенд

```bat
dotnet dev-certs https --trust      :: довіра до локального HTTPS-сертифіката (один раз)
reset.bat                           :: БД CivicBudget + демо-дані + демо-файли
start.bat                           :: API (https://localhost:7080) і клієнт (https://localhost:5173)
```

`start.bat` при першому запуску експортує dev-сертифікат у `.certs/`, встановлює npm-залежності й створює JWT-ключ у user-secrets.

## Конфігурація

`backend/CivicBudget.Api/appsettings.json` містить лише несекретні значення. Секрети й параметри середовища задаються
змінними середовища (подвійне підкреслення замість двокрапки) або `dotnet user-secrets` у режимі Development.

| Параметр | Значення за замовчуванням | Примітка |
|---|---|---|
| `Jwt__Key` | — | **обов'язковий**, ≥ 32 випадкових символи; без нього API не стартує |
| `Jwt__AccessMinutes` / `Jwt__RefreshDays` | 15 / 7 | строк дії токенів |
| `ConnectionStrings__CivicBudget` | `Server=.\SQLEXPRESS;Database=CivicBudget;Trusted_Connection=True;TrustServerCertificate=True;` | обліковий запис служби має мати доступ до БД |
| `Cors__Origins__0` | `http://localhost:5173` | адреси клієнта, якщо він на іншому домені |
| `Storage__Uploads` | `uploads` | папка вкладень (відносно папки застосунку) |
| `Storage__MailOutbox` | `mail-outbox` | папка імітованих листів |
| `ASPNETCORE_ENVIRONMENT` | `Development` у профілях запуску | у `Production` вмикається HSTS, вимикається підказка 2FA |

Якщо SQL Server не приймає `.\SQLEXPRESS` (вимкнено SQL Browser), використайте іменований канал:
`Server=np:\\.\pipe\MSSQL$SQLEXPRESS\sql\query;Database=CivicBudget;Trusted_Connection=True;TrustServerCertificate=True;`.

## Розгортання зібраної версії

```powershell
cd backend
dotnet publish CivicBudget.Api -c Release -o C:\CivicBudget\api
cd ..\frontend
npm ci; npm run build                  # результат — frontend\dist (статичні файли з CSP)
```

- API запускається як служба Windows або за IIS (ASP.NET Core Module). Порти й сертифікат — `ASPNETCORE_URLS`
  і `Kestrel__Certificates__Default__Path/Password`.
- `frontend/dist` віддає будь-який веб-сервер (IIS, nginx), який проксує `/api`, `/hubs` (з WebSocket) і `/swagger` на API.
  Для SPA — переписування невідомих шляхів на `index.html`.

## Дані на диску

| Папка | Вміст | Резервне копіювання |
|---|---|---|
| `uploads/` | фото й PDF вкладень (шляхи — у `Attachment.StorageKey`) | **так**, разом із БД |
| `mail-outbox/` | листи `.eml` (сповіщення, коди 2FA) | ні, можна чистити |

## Безпека

- HTTPS; у Production — HSTS і переадресація з HTTP.
- Захисні заголовки: CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
- Обмеження частоти: вхід / 2FA / реєстрація — 30 запитів за хвилину з IP, решта API — 600. Відповідь — `429`.
- Блокування облікового запису після 5 невдалих входів (у журналі — `user_autoblock`); розблокування — «Користувачі й ролі».
- Лічильники невдалих входів і коди 2FA зберігаються в пам'яті процесу — після перезапуску API скидаються.

## Журнали й діагностика

- Журнал застосунку — консоль (`dotnet run`) або журнал служби. Необроблені помилки: рівень `Error`, повідомлення «Необроблена помилка».
- Дії користувачів — таблиця `AuditLog` і сторінка «Журнал аудиту».

| Симптом | Причина / що зробити |
|---|---|
| API не стартує: «Не задано Jwt:Key» | задати `Jwt__Key` або `dotnet user-secrets set "Jwt:Key" …` |
| «Сервер недоступний» у клієнті | API не запущено або інший порт; перевірити вікно «CivicBudget API» |
| Помилка з'єднання з SQL Server | служба `MSSQL$SQLEXPRESS` зупинена або не та адреса — див. іменований канал вище |
| Браузер попереджає про сертифікат | `dotnet dev-certs https --trust`, видалити `.certs/` і запустити `start.bat` |
| `reset.bat` «зависає» | відкриті з'єднання — закрити вікно API і повторити |
| Порт 5173 / 7080 зайнятий | закрити попередні вікна `start.bat` |
