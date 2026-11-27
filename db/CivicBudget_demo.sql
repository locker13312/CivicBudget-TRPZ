-- Демо-дані для БД CivicBudget.
-- Запускати ПІСЛЯ CivicBudget_create.sql (на щойно створену БД; для повтору — спершу знову create).
-- Дати рахуються від GETDATE(), тож демо працює в будь-який день:
--   минула кампанія (рік - 1) — етап implementation, переможців визначає сама usp_SelectWinners;
--   поточна кампанія (рік) — етап voting, голосування триває зараз.
-- Пароль усіх демо-користувачів: Demo123! (bcrypt-хеш, BCrypt.Net-Next, cost 11).

USE CivicBudget;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM UserAccount) OR EXISTS (SELECT 1 FROM Campaign)
    THROW 51000, N'БД уже містить дані. Спершу перезапустіть CivicBudget_create.sql.', 1;

DECLARE @Today date = CAST(GETDATE() AS date);
DECLARE @Y smallint = YEAR(@Today);
DECLARE @Pwd char(60) = '$2a$11$niNdLw4idhfwlozym/q6xOWk8MeErAwbG9bIB3SRgxRkd9q00bznS';

-- журнал аудиту бачитиме, хто змінював статуси (TR_Project_StatusChange)
EXEC sp_set_session_context @key = N'Ip', @value = '127.0.0.1';

BEGIN TRANSACTION;

-- =====================================================================
-- Підрядники та пункти голосування
-- =====================================================================
INSERT INTO Contractor (Name, Edrpou, Phone, Email) VALUES
(N'ТОВ «Зелене місто-Буд»', '41827365', '+380441110001', 'office@zelene-misto.test'),  -- 1
(N'ТОВ «СвітлоМонтаж»',     '43590218', '+380441110002', 'info@svitlomontazh.test');   -- 2

INSERT INTO PollingStation (Name, Address, DistrictId) VALUES
(N'Пункт голосування №1', N'просп. Володимира Івасюка, 10 (районна бібліотека)', 5),
(N'Пункт голосування №2', N'вул. Ревуцького, 13 (центр надання адміністративних послуг)', 2),
(N'Пункт голосування №3', N'вул. Костянтинівська, 9 (бібліотека)', 7);

-- =====================================================================
-- Користувачі (UserId іде за порядком вставки, БД щойно створена)
--  1 адміністратор, 2 модератор, 3 експерт, 4 оператор, 5 виконавець,
--  6 автор, 7–9 мешканці, 10 мешканець 15 років, 11 неверифікований,
--  12–31 виборці без пароля (вхід лише через BankID) — для обсягу голосів
-- =====================================================================
INSERT INTO UserAccount (LastName, FirstName, MiddleName, BirthDate, IdentityHash, Email, Phone, PasswordHash,
    RegAddress, DistrictId, ContractorId, VerificationStatus, VerificationMethod, VerifiedAt, RegisteredAt)
SELECT u.LastName, u.FirstName, u.MiddleName, u.BirthDate,
    CASE WHEN u.VerStatus = 'verified' THEN CONVERT(char(64), HASHBYTES('SHA2_256', CONCAT(N'demo-id-', u.N)), 2) END,
    u.Email, u.Phone, @Pwd, u.RegAddress, u.DistrictId, u.ContractorId, u.VerStatus,
    CASE WHEN u.VerStatus = 'verified' THEN u.Method END,
    CASE WHEN u.VerStatus = 'verified' THEN DATEADD(day, -500, CAST(@Today AS datetime2(0))) END,
    DATEADD(day, -500, CAST(@Today AS datetime2(0)))
FROM (VALUES
 (1,  N'Коваленко',  N'Олена',   N'Іванівна',    DATEADD(year, -42, @Today), 'admin@civicbudget.test',      '+380501000001', N'вул. Богдана Хмельницького, 32',       10, NULL, 'verified', 'diia'),
 (2,  N'Шевчук',     N'Андрій',  N'Петрович',    DATEADD(year, -35, @Today), 'moderator@civicbudget.test',  '+380501000002', N'вул. Мечникова, 5',         6,  NULL, 'verified', 'bankid'),
 (3,  N'Бондаренко', N'Ірина',   N'Олегівна',    DATEADD(year, -47, @Today), 'expert@civicbudget.test',     '+380501000003', N'вул. Солом''янська, 8',      9,  NULL, 'verified', 'diia'),
 (4,  N'Мельник',    N'Петро',   N'Васильович',  DATEADD(year, -51, @Today), 'operator@civicbudget.test',   '+380501000004', N'просп. Оболонський, 12',      5,  NULL, 'verified', 'bankid'),
 (5,  N'Ткаченко',   N'Василь',  N'Миколайович', DATEADD(year, -39, @Today), 'executor@civicbudget.test',   '+380501000005', N'вул. Здолбунівська, 3',     2,  2,    'verified', 'bankid'),
 (6,  N'Гончаренко', N'Марія',   N'Сергіївна',   DATEADD(year, -29, @Today), 'author@civicbudget.test',     '+380501000006', N'вул. Голосіївська, 17',        1,  NULL, 'verified', 'diia'),
 (7,  N'Кравченко',  N'Олег',    N'Андрійович',  DATEADD(year, -33, @Today), 'resident@civicbudget.test',   '+380501000007', N'вул. Північна, 2',         5,  NULL, 'verified', 'bankid'),
 (8,  N'Савченко',   N'Наталія', N'Юріївна',     DATEADD(year, -26, @Today), 'resident2@civicbudget.test',  '+380501000008', N'вул. Ревуцького, 9',       2,  NULL, 'verified', 'diia'),
 (9,  N'Поліщук',    N'Дмитро',  N'Ігорович',    DATEADD(year, -58, @Today), 'resident3@civicbudget.test',  '+380501000009', N'вул. Межигірська, 30',        7,  NULL, 'verified', 'bankid'),
 (10, N'Олійник',    N'Максим',  N'Романович',   DATEADD(day, -60, DATEADD(year, -15, @Today)),
                                                                             'teen@civicbudget.test',       '+380501000010', N'вул. Кошиця, 11',       2,  NULL, 'verified', 'diia'),
 (11, N'Руденко',    N'Софія',   N'Павлівна',    DATEADD(year, -24, @Today), 'unverified@civicbudget.test', '+380501000011', N'вул. Симиренка, 6',           8,  NULL, 'pending',  NULL)
) u (N, LastName, FirstName, MiddleName, BirthDate, Email, Phone, RegAddress, DistrictId, ContractorId, VerStatus, Method)
ORDER BY u.N;

-- 20 виборців для обсягу голосів (UserId 12–31), без e-mail і пароля
INSERT INTO UserAccount (LastName, FirstName, BirthDate, IdentityHash, DistrictId,
    VerificationStatus, VerificationMethod, VerifiedAt, RegisteredAt)
SELECT n.LastName, n.FirstName,
    DATEADD(day, -n.N * 397, DATEADD(year, -22, @Today)),
    CONVERT(char(64), HASHBYTES('SHA2_256', CONCAT(N'demo-voter-', n.N)), 2),
    (n.N % 10) + 1, 'verified', CASE WHEN n.N % 2 = 0 THEN 'bankid' ELSE 'diia' END,
    DATEADD(day, -450, CAST(@Today AS datetime2(0))), DATEADD(day, -450, CAST(@Today AS datetime2(0)))
FROM (VALUES
 (1, N'Бойко', N'Тарас'), (2, N'Кравець', N'Галина'), (3, N'Лисенко', N'Роман'), (4, N'Марченко', N'Оксана'),
 (5, N'Остапенко', N'Юрій'), (6, N'Павленко', N'Леся'), (7, N'Романенко', N'Богдан'), (8, N'Сидоренко', N'Віра'),
 (9, N'Тимошенко', N'Ігор'), (10, N'Ус', N'Ольга'), (11, N'Федоренко', N'Артем'), (12, N'Харченко', N'Дарина'),
 (13, N'Царенко', N'Віктор'), (14, N'Чорновол', N'Ганна'), (15, N'Шаповал', N'Степан'), (16, N'Яковенко', N'Тетяна'),
 (17, N'Андрієнко', N'Микола'), (18, N'Білик', N'Людмила'), (19, N'Гаврилюк', N'Сергій'), (20, N'Дмитренко', N'Христина')
) n (N, LastName, FirstName)
ORDER BY n.N;

-- ролі: 1 resident, 2 moderator, 3 expert, 4 operator, 5 executor, 6 admin
INSERT INTO UserRole (UserId, RoleId, AssignedBy) VALUES
(1, 6, NULL), (1, 1, NULL),
(2, 2, 1), (3, 3, 1), (4, 4, 1), (5, 5, 1),
(6, 1, 1), (7, 1, 1), (8, 1, 1), (9, 1, 1), (10, 1, 1), (11, 1, 1);

INSERT INTO UserRole (UserId, RoleId, AssignedBy)
SELECT UserId, 1, 1 FROM UserAccount WHERE UserId BETWEEN 12 AND 31;

-- =====================================================================
-- Кампанії
-- =====================================================================
INSERT INTO Campaign (CampaignYear, Name, TotalBudget, MinProjectCost, MaxProjectCost,
    SubmissionStart, SubmissionEnd, ReviewEnd, VotingStart, VotingEnd, ResultsDate,
    ShowInterimResults, Status, CreatedBy)
VALUES
-- 1: минула; поки що 'voting', щоб тригер пропустив голоси, далі — підрахунок і usp_SelectWinners
(@Y - 1, CONCAT(N'Громадський бюджет ', @Y - 1), 5000000, 50000, 1000000,
 DATEADD(day, -420, @Today), DATEADD(day, -390, @Today), DATEADD(day, -360, @Today),
 DATEADD(day, -350, @Today), DATEADD(day, -330, @Today), DATEADD(day, -320, @Today), 1, 'voting', 1),
-- 2: поточна, голосування триває
(@Y, CONCAT(N'Громадський бюджет ', @Y), 6000000, 50000, 1500000,
 DATEADD(day, -75, @Today), DATEADD(day, -40, @Today), DATEADD(day, -10, @Today),
 DATEADD(day, -7, @Today), DATEADD(day, 30, @Today), DATEADD(day, 37, @Today), 1, 'voting', 1);

-- ліміти категорій: 1 Інфраструктура, 2 Озеленення, 3 Культура, 4 Освіта, 5 Спорт, 6 Безпека
INSERT INTO CampaignCategory (CampaignId, CategoryId, BudgetLimit) VALUES
(1, 1, 900000), (1, 2, 600000), (1, 3, 400000), (1, 4, 600000), (1, 5, 1000000), (1, 6, 500000),
(2, 1, 1000000), (2, 2, 500000), (2, 3, 400000), (2, 4, 700000), (2, 5, 600000), (2, 6, 800000);

-- =====================================================================
-- Проєкти. Вставляються як 'moderation', а далі статус змінює UPDATE
-- від імені модератора — так спрацьовує TR_Project_StatusChange (аудит і сповіщення).
--  ProjectId 1–6  — минула кампанія
--  ProjectId 7–12 — поточна, опубліковані
--  13 чернетка автора, 14 на модерації, 15 на експертизі, 16 на доопрацюванні (автор)
-- =====================================================================
DECLARE @PastSubmitted datetime2(0) = DATEADD(day, -395, CAST(@Today AS datetime2(0)));
DECLARE @PastPublished datetime2(0) = DATEADD(day, -358, CAST(@Today AS datetime2(0)));
DECLARE @CurSubmitted datetime2(0) = DATEADD(day, -45, CAST(@Today AS datetime2(0)));
DECLARE @CurPublished datetime2(0) = DATEADD(day, -12, CAST(@Today AS datetime2(0)));

INSERT INTO Project (CampaignId, CategoryId, AuthorId, DistrictId, ModeratorId, RegNumber, Title, Summary, Description, Address,
    Status, CreatedAt, UpdatedAt, SubmittedAt)
VALUES
-- минула кампанія
(1, 1, 6, 5, 2, CONCAT('GB-', @Y - 1, '-0001'), N'Освітлення доріжки вздовж озера Опечень',
 N'20 світильників на доріжці, якою мешканці щодня ходять до школи й зупинки.',
 N'Доріжка вздовж озера Опечень завдовжки 600 м увечері не освітлюється, взимку тут темно вже о 17:00. Пропонуємо встановити 20 опор зі світлодіодними світильниками й датчиками руху: світло вмикатиметься, коли хтось іде, а вночі працюватиме на чверть потужності.',
 N'вул. Північна, доріжка вздовж озера Опечень', 'moderation', @PastSubmitted, @PastSubmitted, @PastSubmitted),
(1, 1, 8, 2, 2, CONCAT('GB-', @Y - 1, '-0002'), N'Новий тротуар на вулиці Ревуцького',
 N'Замінити розбитий асфальт тротуару на плитку з бордюром.',
 N'Тротуар на непарному боці вулиці Ревуцького між будинками 7 і 40 у ямах, після дощу там стоять калюжі на всю ширину. Проєкт передбачає демонтаж старого покриття, укладання 900 м² тротуарної плитки та 400 м нового бордюру.',
 N'вул. Ревуцького, 7–40', 'moderation', @PastSubmitted, @PastSubmitted, @PastSubmitted),
(1, 2, 7, 8, 2, CONCAT('GB-', @Y - 1, '-0003'), N'Сквер на пустирі по вулиці Симиренка',
 N'Перетворити пустир між будинками на сквер з деревами й лавками.',
 N'Між будинками 2 і 10 на вулиці Симиренка лишився пустир, який заростає бур''яном. Пропонуємо висадити 60 дерев і кущів, облаштувати клумби, встановити 10 лавок з урнами та прокласти доріжку з гранітного відсіву.',
 N'вул. Симиренка, 2–10', 'moderation', @PastSubmitted, @PastSubmitted, @PastSubmitted),
(1, 5, 9, 3, 2, CONCAT('GB-', @Y - 1, '-0004'), N'Воркаут-майданчик біля ліцею на Троєщині',
 N'Вуличні тренажери для учнів ліцею і мешканців мікрорайону.',
 N'Біля ліцею є вільна ділянка, де зараз лише старий турнік. Пропонуємо встановити комплекс вуличних тренажерів (турніки, бруси, шведська стінка) і укласти 200 м² гумового покриття. Майданчик буде відкритий для всіх у будь-який час.',
 N'просп. Червоної Калини, 45 (біля ліцею)', 'moderation', @PastSubmitted, @PastSubmitted, @PastSubmitted),
(1, 5, 8, 7, 2, CONCAT('GB-', @Y - 1, '-0005'), N'Футбольне поле зі штучним покриттям на Виноградарі',
 N'Повнорозмірне поле для дворових команд і шкільних секцій.',
 N'Шкільне футбольне поле має ґрунтове покриття: навесні й восени грати на ньому неможливо. Проєкт передбачає укладання 1 200 м² штучної трави та огорожу по периметру заввишки 4 м.',
 N'вул. Мостицька, 18 (шкільний стадіон)', 'moderation', @PastSubmitted, @PastSubmitted, @PastSubmitted),
(1, 3, 7, 10, 2, CONCAT('GB-', @Y - 1, '-0006'), N'Літній кінотеатр у парку «Нивки»',
 N'Безкоштовні кінопокази щосуботи з червня до вересня.',
 N'Пропонуємо придбати проєктор, екран 6×4 м і звукове обладнання для показів на галявині біля ставка. Покази організовуватиме районна бібліотека разом з волонтерами, програму обиратимуть мешканці голосуванням.',
 N'парк «Нивки», галявина біля ставка', 'moderation', @PastSubmitted, @PastSubmitted, @PastSubmitted),
-- поточна кампанія, будуть опубліковані
(2, 5, 6, 1, 2, CONCAT('GB-', @Y, '-0001'), N'Спортивний майданчик біля ліцею на Голосіївській',
 N'Тренажери і безпечне покриття замість занедбаного майданчика.',
 N'Майданчик біля ліцею збудовано понад 30 років тому: металеві конструкції іржаві, покриття — розбитий асфальт. Пропонуємо встановити комплекс тренажерів і укласти 200 м² гумового покриття. Користуватимуться учні на уроках фізкультури і мешканці ввечері.',
 N'вул. Голосіївська, 13 (біля ліцею)', 'moderation', @CurSubmitted, @CurSubmitted, @CurSubmitted),
(2, 5, 8, 5, 2, CONCAT('GB-', @Y, '-0002'), N'Скейт-парк на Оболонській набережній',
 N'Перший у районі скейт-парк для підлітків.',
 N'Підлітки катаються на набережній просто між лавками, що небезпечно і для них, і для перехожих. Пропонуємо облаштувати бетонну основу та встановити 6 сталевих модулів: рампи, перила, фанбокс. Місце погоджено з балансоутримувачем набережної.',
 N'Оболонська набережна, біля човнової станції', 'moderation', @CurSubmitted, @CurSubmitted, @CurSubmitted),
(2, 5, 9, 4, 2, CONCAT('GB-', @Y, '-0003'), N'Тенісні столи у сквері на Райдужній',
 N'Чотири всепогодні столи для настільного тенісу.',
 N'У сквері біля школи часто грають у настільний теніс на саморобному столі. Пропонуємо встановити 4 антивандальні тенісні столи на бетонній основі та лавки для очікування.',
 N'вул. Райдужна, сквер біля школи', 'moderation', @CurSubmitted, @CurSubmitted, @CurSubmitted),
(2, 2, 6, 9, 2, CONCAT('GB-', @Y, '-0004'), N'Липова алея вздовж бульвару',
 N'40 молодих лип і крапельний полив на Чоколівському бульварі.',
 N'На ділянці Чоколівського бульвару між вулицями Народного Ополчення і Кавказькою дерева всохли й були зрізані. Пропонуємо висадити 40 саджанців липи висотою 3–3,5 м і змонтувати крапельну систему поливу, щоб дерева прижилися.',
 N'Чоколівський бульвар', 'moderation', @CurSubmitted, @CurSubmitted, @CurSubmitted),
(2, 6, 7, 6, 2, CONCAT('GB-', @Y, '-0005'), N'Відеоспостереження на дитячих майданчиках',
 N'12 камер на шести дитячих майданчиках Печерського району.',
 N'Батьки скаржаться на пошкодження обладнання і сторонніх осіб на майданчиках увечері. Пропонуємо встановити 12 камер з нічним режимом і сервер запису з підключенням до міської системи відеоспостереження. Записи зберігатимуться 30 днів.',
 N'дитячі майданчики на вулицях Бастіонній, Кіквідзе і Звіринецькій', 'moderation', @CurSubmitted, @CurSubmitted, @CurSubmitted),
(2, 3, 9, 7, 2, CONCAT('GB-', @Y, '-0006'), N'Літня сцена для дворових концертів',
 N'Збірна сцена зі звуком і світлом для свят у дворі.',
 N'У великому дворі на Межигірській мешканці щоліта влаштовують концерти й свята, але сцену щоразу збирають з піддонів. Пропонуємо придбати збірну сцену 6×4 м, звукове і світлове обладнання. Зберігатиметься в приміщенні ОСББ.',
 N'вул. Межигірська, 12–18 (двір)', 'moderation', @CurSubmitted, @CurSubmitted, @CurSubmitted),
-- 13: чернетка автора (без номера; подати не можна — прийом закрито, 50012)
(2, 4, 6, 1, NULL, NULL, N'Мультимедійний клас у бібліотеці на Васильківській',
 N'Ноутбуки і проєктор для занять з цифрової грамотності.',
 N'Бібліотека проводить безкоштовні курси для людей старшого віку, але має лише два комп''ютери. Пропонуємо обладнати клас: 10 ноутбуків і проєктор. Заняття двічі на тиждень, запис через бібліотеку.',
 N'вул. Васильківська, 18 (бібліотека)', 'draft', DATEADD(day, -3, CAST(@Today AS datetime2(0))), DATEADD(day, -3, CAST(@Today AS datetime2(0))), NULL),
-- 14: на модерації
(2, 1, 8, 2, 2, CONCAT('GB-', @Y, '-0007'), N'Пандус і тактильна плитка біля поліклініки',
 N'Безбар''єрний вхід для людей на візках і з порушенням зору.',
 N'Від зупинки до входу в поліклініку ведуть сходи без пандуса, а на тротуарі немає тактильних смуг. Пропонуємо облаштувати пандус з поручнями та укласти 50 м² тактильної плитки від зупинки до входу.',
 N'вул. Кошиця, 1 (поліклініка)', 'submitted', @CurSubmitted, @CurSubmitted, @CurSubmitted),
-- 15: на експертизі
(2, 6, 9, 3, 2, CONCAT('GB-', @Y, '-0008'), N'Облаштування укриття в бібліотеці на Закревського',
 N'Вентиляція, освітлення й лавки в підвальному укритті.',
 N'Підвал бібліотеки використовують як укриття під час тривог, але там немає вентиляції й аварійного світла. Пропонуємо змонтувати припливно-витяжну вентиляцію, аварійне освітлення та встановити лавки на 60 місць.',
 N'вул. Закревського, 39 (бібліотека)', 'moderation', @CurSubmitted, @CurSubmitted, @CurSubmitted),
-- 16: повернуто автору на доопрацювання (для живого демо: доопрацювати → подати)
(2, 4, 6, 8, 2, CONCAT('GB-', @Y, '-0009'), N'STEM-лабораторія для гімназії',
 N'Набори з робототехніки та 3D-принтер для безкоштовного гуртка.',
 N'У гімназії працює гурток робототехніки, але учні по черзі користуються двома наборами, які приніс учитель. Пропонуємо обладнати лабораторію: 8 наборів з робототехніки і 3D-принтер. Гурток відкритий для всіх школярів району.',
 N'вул. Гната Юри, 12 (гімназія)', 'moderation', @CurSubmitted, @CurSubmitted, @CurSubmitted);

-- кошториси (вартість = сума позицій, vw_ProjectCost)
INSERT INTO BudgetItem (ProjectId, Name, Unit, Quantity, UnitPrice) VALUES
(1, N'Опора зі світильником LED', N'шт', 20, 15000),            -- 300 000
(1, N'Кабель, підключення та монтаж', N'посл', 1, 120000),       -- = 420 000
(2, N'Тротуарна плитка з укладанням', N'м²', 900, 600),          -- 540 000
(2, N'Бордюр', N'м', 400, 275),                                  -- = 650 000
(3, N'Саджанці дерев і кущів', N'шт', 60, 2500),                 -- 150 000
(3, N'Лавка з урною', N'шт', 10, 8000),                          --  80 000
(3, N'Облаштування клумб', N'посл', 1, 50000),                   -- = 280 000
(4, N'Комплекс вуличних тренажерів', N'компл', 1, 260000),
(4, N'Гумове покриття', N'м²', 200, 650),                        -- = 390 000
(5, N'Штучне покриття з укладанням', N'м²', 1200, 550),          -- 660 000
(5, N'Огорожа', N'м', 240, 1000),                                -- = 900 000
(6, N'Проєктор і екран', N'компл', 1, 110000),
(6, N'Звукове обладнання', N'компл', 1, 40000),                  -- = 150 000
(7, N'Комплекс тренажерів', N'компл', 1, 220000),
(7, N'Гумове покриття', N'м²', 200, 650),                        -- = 350 000
(8, N'Модуль для скейт-парку', N'шт', 6, 40000),
(8, N'Бетонна основа', N'посл', 1, 60000),                       -- = 300 000
(9, N'Тенісний стіл всепогодний', N'шт', 4, 22500),
(9, N'Підготовка основи та монтаж', N'посл', 1, 30000),          -- = 120 000
(10, N'Саджанець липи', N'шт', 40, 3000),
(10, N'Крапельна система поливу', N'компл', 1, 60000),           -- = 180 000
(11, N'Камера відеоспостереження', N'шт', 12, 25000),
(11, N'Сервер запису', N'шт', 1, 150000),                        -- = 450 000
(12, N'Збірна сцена', N'компл', 1, 180000),
(12, N'Звук і світло', N'компл', 1, 70000),                      -- = 250 000
(13, N'Ноутбук', N'шт', 10, 28000),
(13, N'Проєктор', N'шт', 1, 45000),                              -- = 325 000
(14, N'Пандус з поручнями', N'посл', 1, 140000),
(14, N'Тактильна плитка', N'м²', 50, 1200),                      -- = 200 000
(15, N'Припливно-витяжна вентиляція', N'компл', 1, 260000),
(15, N'Аварійне освітлення та лавки', N'посл', 1, 90000),        -- = 350 000
(16, N'Набір робототехніки', N'шт', 8, 18000),
(16, N'3D-принтер', N'шт', 1, 45000);                            -- = 189 000

-- рішення модератора і експерта
INSERT INTO Review (ProjectId, ReviewerId, ReviewType, Decision, Comment, CreatedAt)
SELECT ProjectId, 2, 'moderation', 'approve', N'Відповідає вимогам положення.',
    CASE WHEN CampaignId = 1 THEN DATEADD(day, -1, @PastPublished) ELSE DATEADD(day, -1, @CurPublished) END
FROM Project WHERE ProjectId BETWEEN 1 AND 12;

INSERT INTO Review (ProjectId, ReviewerId, ReviewType, Decision, Comment, CreatedAt) VALUES
(15, 2, 'moderation', 'approve', N'Формальні вимоги виконано. Потрібна технічна експертиза щодо вентиляції укриття.', DATEADD(day, -20, CAST(@Today AS datetime2(0)))),
(16, 2, 'moderation', 'revise',  N'Додайте до кошторису меблі для лабораторії (столи, стільці) та уточніть, чи погоджено розміщення з адміністрацією гімназії.', DATEADD(day, -18, CAST(@Today AS datetime2(0))));

-- зміни статусів від імені модератора (UserId = 2)
EXEC sp_set_session_context @key = N'UserId', @value = 2;

UPDATE Project SET Status = 'published', PublishedAt = @PastPublished, UpdatedAt = @PastPublished
WHERE ProjectId BETWEEN 1 AND 6;

UPDATE Project SET Status = 'published', PublishedAt = @CurPublished, UpdatedAt = @CurPublished
WHERE ProjectId BETWEEN 7 AND 12;

UPDATE Project SET Status = 'moderation' WHERE ProjectId = 14;
UPDATE Project SET Status = 'expertise'  WHERE ProjectId = 15;
UPDATE Project SET Status = 'revision', UpdatedAt = DATEADD(day, -18, CAST(@Today AS datetime2(0))) WHERE ProjectId = 16;

-- =====================================================================
-- Голоси минулої кампанії (CastAt — у межах її голосування)
-- =====================================================================
DECLARE @PastCast datetime2(3) = DATEADD(day, -340, CAST(@Today AS datetime2(3)));

-- онлайн: виборці 12–25 по 5 голосів, 26–31 по 5 голосів, автор 1 голос
INSERT INTO Vote (VoterId, ProjectId, VoteCount, Channel, CastAt)
SELECT u.UserId, x.ProjectId, x.Cnt, 'online', @PastCast
FROM UserAccount u CROSS JOIN (VALUES (1, 2), (3, 1), (4, 2)) x (ProjectId, Cnt)
WHERE u.UserId BETWEEN 12 AND 25;

INSERT INTO Vote (VoterId, ProjectId, VoteCount, Channel, CastAt)
SELECT u.UserId, x.ProjectId, x.Cnt, 'online', @PastCast
FROM UserAccount u CROSS JOIN (VALUES (2, 2), (5, 2), (6, 1)) x (ProjectId, Cnt)
WHERE u.UserId BETWEEN 26 AND 31;

INSERT INTO Vote (VoterId, ProjectId, VoteCount, Channel, CastAt) VALUES (6, 1, 1, 'online', @PastCast);

-- паперові бюлетені (пункт №1, оператор 4)
INSERT INTO Vote (VoterId, ProjectId, VoteCount, Channel, StationId, OperatorId, CastAt)
SELECT u.UserId, x.ProjectId, 2, 'paper', 1, 4, @PastCast
FROM UserAccount u CROSS JOIN (VALUES (3), (6)) x (ProjectId)
WHERE u.UserId IN (7, 8);

-- підрахунок і визначення переможців самою процедурою (від імені адміністратора)
EXEC sp_set_session_context @key = N'UserId', @value = 1;
UPDATE Campaign SET Status = 'counting' WHERE CampaignId = 1;

PRINT N'--- Рейтинг минулої кампанії (usp_SelectWinners) ---';
EXEC usp_SelectWinners @CampaignId = 1;

-- =====================================================================
-- Реалізація проєктів минулої кампанії
--  проєкт 1 — реалізується (етапи, звіти виконавця з фото)
--  проєкт 3 — реалізовано
-- =====================================================================
UPDATE Project SET Status = 'implementing' WHERE ProjectId IN (1, 3);
UPDATE Project SET Status = 'completed' WHERE ProjectId = 3;

INSERT INTO Implementation (ProjectId, ContractorId, PlannedBudget, StartDate, PlannedEndDate, ActualEndDate, Status, CreatedBy, CreatedAt) VALUES
(1, 2, 420000, DATEADD(day, -200, @Today), DATEADD(day, 60, @Today), NULL, 'in_progress', 1, DATEADD(day, -205, CAST(@Today AS datetime2(0)))),
(3, 1, 280000, DATEADD(day, -280, @Today), DATEADD(day, -120, @Today), DATEADD(day, -130, @Today), 'completed', 1, DATEADD(day, -285, CAST(@Today AS datetime2(0))));

INSERT INTO ImplementationStage (ImplementationId, StageNo, Name, PlannedEndDate, PlannedCost, ActualCost, Status, CompletedAt) VALUES
(1, 1, N'Проєктна документація та погодження', DATEADD(day, -170, @Today), 40000, 38500, 'done', DATEADD(day, -172, @Today)),  -- StageId 1
(1, 2, N'Встановлення опор і світильників',    DATEADD(day, 20, @Today), 300000, NULL, 'in_progress', NULL),                   -- 2
(1, 3, N'Підключення та здача в експлуатацію', DATEADD(day, 60, @Today), 80000, NULL, 'planned', NULL),                         -- 3
(2, 1, N'Підготовка ділянки та ґрунту',        DATEADD(day, -220, @Today), 100000, 95000, 'done', DATEADD(day, -225, @Today)), -- 4
(2, 2, N'Висадка дерев, монтаж лавок і клумб', DATEADD(day, -120, @Today), 180000, 178000, 'done', DATEADD(day, -130, @Today)); -- 5

-- звіти виконавця (UserId 5, ТОВ «СвітлоМонтаж» / адміністратор приймає)
INSERT INTO Report (StageId, AuthorId, Body, Status, SubmittedAt, ReviewedBy, ReviewedAt, ReviewComment) VALUES
(1, 5, N'Розроблено та погоджено проєктну документацію, отримано технічні умови на підключення.', 'accepted',
 DATEADD(day, -173, CAST(@Today AS datetime2(0))), 1, DATEADD(day, -171, CAST(@Today AS datetime2(0))), N'Прийнято.'),
(2, 5, N'Встановлено 12 із 20 опор, змонтовано світильники на першій ділянці доріжки.', 'submitted',
 DATEADD(day, -5, CAST(@Today AS datetime2(0))), NULL, NULL, NULL),
(5, 5, N'Висаджено 60 дерев і кущів, встановлено 10 лавок, облаштовано клумби. Об''єкт здано.', 'accepted',
 DATEADD(day, -131, CAST(@Today AS datetime2(0))), 1, DATEADD(day, -130, CAST(@Today AS datetime2(0))), N'Прийнято, акт підписано.');

-- фото до звітів (самі файли — у сховищі, тут лише метадані)
INSERT INTO Attachment (ReportId, FileName, MimeType, StorageKey, SizeBytes, UploadedBy, UploadedAt) VALUES
(1, N'проєктна-документація.pdf', 'application/pdf', 'reports/1/doc-1.pdf', 691, 5, DATEADD(day, -173, CAST(@Today AS datetime2(0)))),
(2, N'опори-ділянка-1.jpg', 'image/jpeg', 'reports/2/photo-1.jpg', 16739, 5, DATEADD(day, -5, CAST(@Today AS datetime2(0)))),
(2, N'світильники-вечір.jpg', 'image/jpeg', 'reports/2/photo-2.jpg', 19536, 5, DATEADD(day, -5, CAST(@Today AS datetime2(0)))),
(3, N'сквер-готовий.jpg', 'image/jpeg', 'reports/3/photo-1.jpg', 20247, 5, DATEADD(day, -131, CAST(@Today AS datetime2(0))));

-- фото до проєктів (файли — у db/demo-files/, reset.ps1 копіює їх у папку uploads/ бекенду)
INSERT INTO Attachment (ProjectId, FileName, MimeType, StorageKey, SizeBytes, UploadedBy, UploadedAt)
SELECT p.ProjectId, N'фото-проєкту.jpg', 'image/jpeg', CONCAT('projects/', p.ProjectId, '/photo-1.jpg'), x.Size, p.AuthorId, p.CreatedAt
FROM (VALUES (1, 21060), (2, 20814), (3, 20247), (4, 19052), (5, 24551), (6, 20042), (7, 19052), (8, 16271),
             (9, 16719), (10, 27262), (11, 16384), (12, 18620), (16, 18946)) x (ProjectId, Size)
JOIN Project p ON p.ProjectId = x.ProjectId;

-- точки на карті (Project.Location, geography WGS 84: Point(широта, довгота, 4326)); статус не змінюється — тригер мовчить
UPDATE p SET Location = geography::Point(x.Lat, x.Lng, 4326)
FROM Project p
JOIN (VALUES (1, 50.5157, 30.4938), (2, 50.4011, 30.6395), (3, 50.4615, 30.3632), (4, 50.5157, 30.6050),
             (5, 50.5108, 30.4214), (6, 50.4600, 30.4100), (7, 50.4034, 30.5113), (8, 50.5002, 30.5180),
             (9, 50.4746, 30.6128), (10, 50.4317, 30.4627), (11, 50.4231, 30.5545), (12, 50.4703, 30.5122),
             (13, 50.3955, 30.5072), (14, 50.4083, 30.6247), (15, 50.5232, 30.6176), (16, 50.4430, 30.3653)
     ) x (ProjectId, Lat, Lng) ON x.ProjectId = p.ProjectId;

-- двофакторна автентифікація: обов'язкова для адміністратора, модератора й експерта (ТЗ ч.2 п.3.3);
-- код приходить листом у mail-outbox/
UPDATE UserAccount SET TwoFactorEnabled = 1 WHERE UserId IN (1, 2, 3);

-- =====================================================================
-- Голоси поточної кампанії (CastAt = зараз)
--  мешканець 7 (resident@) ще не голосував — для живого демо;
--  мешканка 8 — 3 голоси онлайн; мешканець 9 — паперовий бюлетень.
--  Спорт (ліміт 600 000): №7 (350 000) має найбільше голосів, №8 (300 000) — другий,
--  але вже не вміщується в залишок 250 000; №9 (120 000) — третій і проходить.
-- =====================================================================
INSERT INTO Vote (VoterId, ProjectId, VoteCount, Channel)
SELECT u.UserId, x.ProjectId, x.Cnt, 'online'
FROM UserAccount u CROSS JOIN (VALUES (7, 2), (8, 1), (10, 2)) x (ProjectId, Cnt)
WHERE u.UserId BETWEEN 12 AND 19;

INSERT INTO Vote (VoterId, ProjectId, VoteCount, Channel)
SELECT u.UserId, x.ProjectId, x.Cnt, 'online'
FROM UserAccount u CROSS JOIN (VALUES (8, 1), (11, 2), (12, 2)) x (ProjectId, Cnt)
WHERE u.UserId BETWEEN 20 AND 25;

INSERT INTO Vote (VoterId, ProjectId, VoteCount, Channel) VALUES
(8, 7, 1, 'online'), (8, 9, 1, 'online'), (8, 12, 1, 'online');

-- паперові бюлетені (пункт №3, оператор 4)
INSERT INTO Vote (VoterId, ProjectId, VoteCount, Channel, StationId, OperatorId)
SELECT u.UserId, x.ProjectId, x.Cnt, 'paper', 3, 4
FROM UserAccount u CROSS JOIN (VALUES (9, 1), (11, 2), (10, 2)) x (ProjectId, Cnt)
WHERE u.UserId BETWEEN 26 AND 31;

INSERT INTO Vote (VoterId, ProjectId, VoteCount, Channel, StationId, OperatorId) VALUES
(9, 8, 1, 'paper', 2, 4), (9, 10, 1, 'paper', 2, 4);

-- підписки та системні сповіщення
INSERT INTO Subscription (UserId, ProjectId) VALUES (7, 10), (7, 1), (8, 7), (9, 11);

INSERT INTO Notification (UserId, ProjectId, NotifType, Channel, Body) VALUES
(7, NULL, 'system', 'inapp', CONCAT(N'Триває голосування «Громадський бюджет ', @Y, N'». У вас 5 голосів, за один проєкт можна віддати не більше двох.')),
(8, NULL, 'system', 'inapp', CONCAT(N'Триває голосування «Громадський бюджет ', @Y, N'». У вас лишилося 2 голоси.')),
(7, 1, 'report', 'inapp', N'Виконавець подав звіт за етапом «Встановлення опор і світильників» проєкту, за яким ви стежите.');

COMMIT TRANSACTION;

EXEC sp_set_session_context @key = N'UserId', @value = NULL;

-- =====================================================================
-- Перевірка бізнес-правил: 6 навмисних порушень.
-- Кожне — у своїй транзакції з відкатом, даних не лишає. Помилки ОЧІКУВАНІ.
-- =====================================================================
SET XACT_ABORT OFF;
DECLARE @Check TABLE (No int, Rule_ nvarchar(120), ErrorNumber int, ErrorMessage nvarchar(400));

-- 1. голос 15-річного → 50002
BEGIN TRY
    BEGIN TRANSACTION;
    INSERT INTO Vote (VoterId, ProjectId, VoteCount, Channel) VALUES (10, 7, 1, 'online');
    COMMIT TRANSACTION;
    INSERT INTO @Check VALUES (1, N'Голос 15-річного (очікувано 50002)', NULL, N'Правило не спрацювало: голос пройшов.');
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    INSERT INTO @Check VALUES (1, N'Голос 15-річного (очікувано 50002)', ERROR_NUMBER(), ERROR_MESSAGE());
END CATCH;

-- 2. 3 голоси за один проєкт → 50003
BEGIN TRY
    BEGIN TRANSACTION;
    INSERT INTO Vote (VoterId, ProjectId, VoteCount, Channel) VALUES (7, 7, 3, 'online');
    COMMIT TRANSACTION;
    INSERT INTO @Check VALUES (2, N'3 голоси за проєкт (очікувано 50003)', NULL, N'Правило не спрацювало: голос пройшов.');
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    INSERT INTO @Check VALUES (2, N'3 голоси за проєкт (очікувано 50003)', ERROR_NUMBER(), ERROR_MESSAGE());
END CATCH;

-- 3. 6 голосів у кампанії → 50004 (у мешканки 8 уже 3, додаємо 2 + 1)
BEGIN TRY
    BEGIN TRANSACTION;
    INSERT INTO Vote (VoterId, ProjectId, VoteCount, Channel) VALUES (8, 8, 2, 'online');
    INSERT INTO Vote (VoterId, ProjectId, VoteCount, Channel) VALUES (8, 10, 1, 'online');
    COMMIT TRANSACTION;
    INSERT INTO @Check VALUES (3, N'6 голосів у кампанії (очікувано 50004)', NULL, N'Правило не спрацювало: голос пройшов.');
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    INSERT INTO @Check VALUES (3, N'6 голосів у кампанії (очікувано 50004)', ERROR_NUMBER(), ERROR_MESSAGE());
END CATCH;

-- 4. онлайн після паперового бюлетеня → 50005
BEGIN TRY
    BEGIN TRANSACTION;
    INSERT INTO Vote (VoterId, ProjectId, VoteCount, Channel) VALUES (9, 11, 1, 'online');
    COMMIT TRANSACTION;
    INSERT INTO @Check VALUES (4, N'Онлайн + паперовий (очікувано 50005)', NULL, N'Правило не спрацювало: голос пройшов.');
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    INSERT INTO @Check VALUES (4, N'Онлайн + паперовий (очікувано 50005)', ERROR_NUMBER(), ERROR_MESSAGE());
END CATCH;

-- 5. голос за неопублікований проєкт (на модерації) → 50001
BEGIN TRY
    BEGIN TRANSACTION;
    INSERT INTO Vote (VoterId, ProjectId, VoteCount, Channel) VALUES (7, 14, 1, 'online');
    COMMIT TRANSACTION;
    INSERT INTO @Check VALUES (5, N'Голос за неопублікований проєкт (очікувано 50001)', NULL, N'Правило не спрацювало: голос пройшов.');
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    INSERT INTO @Check VALUES (5, N'Голос за неопублікований проєкт (очікувано 50001)', ERROR_NUMBER(), ERROR_MESSAGE());
END CATCH;

-- 6. повторний голос за той самий проєкт → UQ_Vote_Voter_Project (2627)
BEGIN TRY
    BEGIN TRANSACTION;
    INSERT INTO Vote (VoterId, ProjectId, VoteCount, Channel) VALUES (8, 7, 1, 'online');
    COMMIT TRANSACTION;
    INSERT INTO @Check VALUES (6, N'Повторний голос за проєкт (очікувано 2627, UQ_Vote_Voter_Project)', NULL, N'Правило не спрацювало: голос пройшов.');
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    INSERT INTO @Check VALUES (6, N'Повторний голос за проєкт (очікувано 2627, UQ_Vote_Voter_Project)', ERROR_NUMBER(), ERROR_MESSAGE());
END CATCH;

PRINT N'--- Перевірка бізнес-правил (помилки очікувані) ---';
SELECT No AS [№], Rule_ AS [Порушення], ErrorNumber AS [Код], ErrorMessage AS [Повідомлення] FROM @Check ORDER BY No;

-- =====================================================================
-- Підсумок: кількість рядків у кожній таблиці
-- =====================================================================
PRINT N'--- Кількість рядків ---';
SELECT t.TableName AS [Таблиця], t.Cnt AS [Рядків] FROM (
    SELECT 'District' AS TableName, COUNT(*) AS Cnt, 1 AS Ord FROM District
    UNION ALL SELECT 'Category', COUNT(*), 2 FROM Category
    UNION ALL SELECT 'AppRole', COUNT(*), 3 FROM AppRole
    UNION ALL SELECT 'Contractor', COUNT(*), 4 FROM Contractor
    UNION ALL SELECT 'PollingStation', COUNT(*), 5 FROM PollingStation
    UNION ALL SELECT 'UserAccount', COUNT(*), 6 FROM UserAccount
    UNION ALL SELECT 'UserRole', COUNT(*), 7 FROM UserRole
    UNION ALL SELECT 'Campaign', COUNT(*), 8 FROM Campaign
    UNION ALL SELECT 'CampaignCategory', COUNT(*), 9 FROM CampaignCategory
    UNION ALL SELECT 'Project', COUNT(*), 10 FROM Project
    UNION ALL SELECT 'BudgetItem', COUNT(*), 11 FROM BudgetItem
    UNION ALL SELECT 'Review', COUNT(*), 12 FROM Review
    UNION ALL SELECT 'Subscription', COUNT(*), 13 FROM Subscription
    UNION ALL SELECT 'Vote', COUNT(*), 14 FROM Vote
    UNION ALL SELECT 'Implementation', COUNT(*), 15 FROM Implementation
    UNION ALL SELECT 'ImplementationStage', COUNT(*), 16 FROM ImplementationStage
    UNION ALL SELECT 'Report', COUNT(*), 17 FROM Report
    UNION ALL SELECT 'Attachment', COUNT(*), 18 FROM Attachment
    UNION ALL SELECT 'Notification', COUNT(*), 19 FROM Notification
    UNION ALL SELECT 'AuditLog', COUNT(*), 20 FROM AuditLog
) t ORDER BY t.Ord;
GO
