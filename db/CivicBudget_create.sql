-- БД громадського бюджету, MS SQL Server 2019+

USE master;
GO

IF DB_ID(N'CivicBudget') IS NOT NULL
BEGIN
    ALTER DATABASE CivicBudget SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE CivicBudget;
END
GO

CREATE DATABASE CivicBudget COLLATE Cyrillic_General_CI_AS;
GO

USE CivicBudget;
GO

-- довідники

CREATE TABLE District (
    DistrictId tinyint IDENTITY(1,1) NOT NULL,
    Name nvarchar(60) NOT NULL,
    CONSTRAINT PK_District PRIMARY KEY (DistrictId),
    CONSTRAINT UQ_District_Name UNIQUE (Name)
);

CREATE TABLE Category (
    CategoryId tinyint IDENTITY(1,1) NOT NULL,
    Name nvarchar(60) NOT NULL,
    Description nvarchar(300) NULL,
    CONSTRAINT PK_Category PRIMARY KEY (CategoryId),
    CONSTRAINT UQ_Category_Name UNIQUE (Name)
);

CREATE TABLE AppRole (
    RoleId tinyint IDENTITY(1,1) NOT NULL,
    Code varchar(20) NOT NULL,
    Name nvarchar(50) NOT NULL,
    CONSTRAINT PK_AppRole PRIMARY KEY (RoleId),
    CONSTRAINT UQ_AppRole_Code UNIQUE (Code)
);

CREATE TABLE Contractor (
    ContractorId int IDENTITY(1,1) NOT NULL,
    Name nvarchar(200) NOT NULL,
    Edrpou char(8) NOT NULL,
    Phone varchar(20) NULL,
    Email varchar(254) NULL,
    CONSTRAINT PK_Contractor PRIMARY KEY (ContractorId),
    CONSTRAINT UQ_Contractor_Edrpou UNIQUE (Edrpou),
    CONSTRAINT CK_Contractor_Edrpou CHECK (Edrpou NOT LIKE '%[^0-9]%')
);

CREATE TABLE PollingStation (
    StationId smallint IDENTITY(1,1) NOT NULL,
    Name nvarchar(100) NOT NULL,
    Address nvarchar(200) NOT NULL,
    DistrictId tinyint NOT NULL,
    IsActive bit NOT NULL CONSTRAINT DF_PollingStation_IsActive DEFAULT 1,
    CONSTRAINT PK_PollingStation PRIMARY KEY (StationId),
    CONSTRAINT FK_PollingStation_District FOREIGN KEY (DistrictId) REFERENCES District (DistrictId)
);

-- користувачі та ролі

CREATE TABLE UserAccount (
    UserId int IDENTITY(1,1) NOT NULL,
    LastName nvarchar(50) NOT NULL,
    FirstName nvarchar(50) NOT NULL,
    MiddleName nvarchar(50) NULL,
    BirthDate date NULL,
    IdentityHash char(64) NULL, -- SHA-256 від РНОКПП або паспорта
    Email varchar(254) NULL,
    Phone varchar(20) NULL,
    PasswordHash char(60) NULL, -- bcrypt, NULL якщо вхід через BankID
    RegAddress nvarchar(200) NULL,
    DistrictId tinyint NULL,
    ContractorId int NULL, -- для виконавців
    VerificationStatus varchar(10) NOT NULL CONSTRAINT DF_UserAccount_VerStatus DEFAULT 'pending',
    VerificationMethod varchar(10) NULL,
    VerifiedAt datetime2(0) NULL,
    TwoFactorEnabled bit NOT NULL CONSTRAINT DF_UserAccount_TwoFactor DEFAULT 0,
    IsBlocked bit NOT NULL CONSTRAINT DF_UserAccount_IsBlocked DEFAULT 0,
    RegisteredAt datetime2(0) NOT NULL CONSTRAINT DF_UserAccount_RegisteredAt DEFAULT SYSDATETIME(),
    CONSTRAINT PK_UserAccount PRIMARY KEY (UserId),
    CONSTRAINT FK_UserAccount_District FOREIGN KEY (DistrictId) REFERENCES District (DistrictId),
    CONSTRAINT FK_UserAccount_Contractor FOREIGN KEY (ContractorId) REFERENCES Contractor (ContractorId),
    CONSTRAINT CK_UserAccount_VerStatus CHECK (VerificationStatus IN ('pending', 'verified', 'rejected')),
    CONSTRAINT CK_UserAccount_VerMethod CHECK (VerificationMethod IN ('bankid', 'diia', 'passport')),
    CONSTRAINT CK_UserAccount_Verified CHECK (VerificationStatus <> 'verified'
        OR (VerificationMethod IS NOT NULL AND VerifiedAt IS NOT NULL AND BirthDate IS NOT NULL AND IdentityHash IS NOT NULL)),
    CONSTRAINT CK_UserAccount_BirthDate CHECK (BirthDate > '1900-01-01'),
    CONSTRAINT CK_UserAccount_Email CHECK (Email LIKE '%_@_%._%')
);

-- фільтровані, бо UNIQUE пропускає лише один NULL
CREATE UNIQUE INDEX UX_UserAccount_Email ON UserAccount (Email) WHERE Email IS NOT NULL;
CREATE UNIQUE INDEX UX_UserAccount_IdentityHash ON UserAccount (IdentityHash) WHERE IdentityHash IS NOT NULL;
CREATE INDEX IX_UserAccount_LastName ON UserAccount (LastName, FirstName);

CREATE TABLE UserRole (
    UserId int NOT NULL,
    RoleId tinyint NOT NULL,
    AssignedAt datetime2(0) NOT NULL CONSTRAINT DF_UserRole_AssignedAt DEFAULT SYSDATETIME(),
    AssignedBy int NULL,
    CONSTRAINT PK_UserRole PRIMARY KEY (UserId, RoleId),
    CONSTRAINT FK_UserRole_User FOREIGN KEY (UserId) REFERENCES UserAccount (UserId) ON DELETE CASCADE,
    CONSTRAINT FK_UserRole_Role FOREIGN KEY (RoleId) REFERENCES AppRole (RoleId),
    CONSTRAINT FK_UserRole_AssignedBy FOREIGN KEY (AssignedBy) REFERENCES UserAccount (UserId)
);

-- кампанії

CREATE TABLE Campaign (
    CampaignId smallint IDENTITY(1,1) NOT NULL,
    CampaignYear smallint NOT NULL,
    Name nvarchar(150) NOT NULL,
    TotalBudget decimal(14,2) NOT NULL,
    MinProjectCost decimal(12,2) NOT NULL CONSTRAINT DF_Campaign_MinCost DEFAULT 50000,
    MaxProjectCost decimal(12,2) NOT NULL,
    VotesPerVoter tinyint NOT NULL CONSTRAINT DF_Campaign_VotesPerVoter DEFAULT 5,
    MaxVotesPerProject tinyint NOT NULL CONSTRAINT DF_Campaign_MaxVotesPerProject DEFAULT 2,
    MaxProjectsPerAuthor tinyint NOT NULL CONSTRAINT DF_Campaign_MaxProjects DEFAULT 5,
    MinVoterAge tinyint NOT NULL CONSTRAINT DF_Campaign_MinVoterAge DEFAULT 16,
    SubmissionStart date NOT NULL,
    SubmissionEnd date NOT NULL,
    ReviewEnd date NOT NULL,
    VotingStart date NOT NULL,
    VotingEnd date NOT NULL,
    ResultsDate date NOT NULL,
    ShowInterimResults bit NOT NULL CONSTRAINT DF_Campaign_ShowInterim DEFAULT 0,
    Status varchar(15) NOT NULL CONSTRAINT DF_Campaign_Status DEFAULT 'draft',
    CreatedBy int NULL,
    CONSTRAINT PK_Campaign PRIMARY KEY (CampaignId),
    CONSTRAINT UQ_Campaign_Year UNIQUE (CampaignYear),
    CONSTRAINT FK_Campaign_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES UserAccount (UserId),
    CONSTRAINT CK_Campaign_Status CHECK (Status IN ('draft', 'submission', 'review', 'voting', 'counting', 'implementation', 'closed')),
    CONSTRAINT CK_Campaign_Budget CHECK (TotalBudget > 0 AND MinProjectCost > 0
        AND MinProjectCost <= MaxProjectCost AND MaxProjectCost <= TotalBudget),
    CONSTRAINT CK_Campaign_Votes CHECK (VotesPerVoter >= 1 AND MaxVotesPerProject BETWEEN 1 AND VotesPerVoter),
    CONSTRAINT CK_Campaign_Projects CHECK (MaxProjectsPerAuthor >= 1),
    CONSTRAINT CK_Campaign_Dates CHECK (SubmissionStart <= SubmissionEnd AND SubmissionEnd <= ReviewEnd
        AND ReviewEnd < VotingStart AND VotingStart <= VotingEnd AND VotingEnd <= ResultsDate)
);

-- ліміт категорії в кампанії
CREATE TABLE CampaignCategory (
    CampaignId smallint NOT NULL,
    CategoryId tinyint NOT NULL,
    BudgetLimit decimal(14,2) NOT NULL,
    CONSTRAINT PK_CampaignCategory PRIMARY KEY (CampaignId, CategoryId),
    CONSTRAINT FK_CampaignCategory_Campaign FOREIGN KEY (CampaignId) REFERENCES Campaign (CampaignId) ON DELETE CASCADE,
    CONSTRAINT FK_CampaignCategory_Category FOREIGN KEY (CategoryId) REFERENCES Category (CategoryId),
    CONSTRAINT CK_CampaignCategory_Limit CHECK (BudgetLimit > 0)
);

-- проєкти

CREATE TABLE Project (
    ProjectId int IDENTITY(1,1) NOT NULL,
    CampaignId smallint NOT NULL,
    CategoryId tinyint NOT NULL,
    AuthorId int NOT NULL,
    DistrictId tinyint NOT NULL,
    ModeratorId int NULL,
    DuplicateOfId int NULL,
    RegNumber varchar(20) NULL, -- GB-2027-0001
    Title nvarchar(200) NOT NULL,
    Summary nvarchar(500) NULL,
    Description nvarchar(max) NULL, -- у чернетці може бути NULL
    Address nvarchar(200) NULL,
    Location geography NULL,
    Status varchar(15) NOT NULL CONSTRAINT DF_Project_Status DEFAULT 'draft',
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_Project_CreatedAt DEFAULT SYSDATETIME(),
    UpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_Project_UpdatedAt DEFAULT SYSDATETIME(),
    SubmittedAt datetime2(0) NULL,
    PublishedAt datetime2(0) NULL,
    CONSTRAINT PK_Project PRIMARY KEY (ProjectId),
    -- категорія має бути відкрита в цій кампанії
    CONSTRAINT FK_Project_CampaignCategory FOREIGN KEY (CampaignId, CategoryId)
        REFERENCES CampaignCategory (CampaignId, CategoryId),
    CONSTRAINT FK_Project_Author FOREIGN KEY (AuthorId) REFERENCES UserAccount (UserId),
    CONSTRAINT FK_Project_District FOREIGN KEY (DistrictId) REFERENCES District (DistrictId),
    CONSTRAINT FK_Project_Moderator FOREIGN KEY (ModeratorId) REFERENCES UserAccount (UserId),
    CONSTRAINT FK_Project_DuplicateOf FOREIGN KEY (DuplicateOfId) REFERENCES Project (ProjectId),
    CONSTRAINT CK_Project_Status CHECK (Status IN ('draft', 'submitted', 'moderation', 'revision', 'expertise',
        'rejected', 'published', 'winner', 'not_selected', 'implementing', 'completed')),
    CONSTRAINT CK_Project_Submitted CHECK (Status = 'draft'
        OR (RegNumber IS NOT NULL AND SubmittedAt IS NOT NULL AND Description IS NOT NULL)),
    CONSTRAINT CK_Project_Published CHECK (Status NOT IN ('published', 'winner', 'not_selected', 'implementing', 'completed')
        OR PublishedAt IS NOT NULL),
    CONSTRAINT CK_Project_Duplicate CHECK (DuplicateOfId <> ProjectId)
);

CREATE UNIQUE INDEX UX_Project_RegNumber ON Project (RegNumber) WHERE RegNumber IS NOT NULL;
CREATE INDEX IX_Project_Campaign_Status ON Project (CampaignId, Status) INCLUDE (CategoryId, DistrictId);
CREATE INDEX IX_Project_Author ON Project (AuthorId);
CREATE INDEX IX_Project_Moderator ON Project (ModeratorId) WHERE ModeratorId IS NOT NULL;
CREATE SPATIAL INDEX SIX_Project_Location ON Project (Location);

-- кошторис, сума рахується в vw_ProjectCost
CREATE TABLE BudgetItem (
    BudgetItemId int IDENTITY(1,1) NOT NULL,
    ProjectId int NOT NULL,
    Name nvarchar(200) NOT NULL,
    Unit nvarchar(20) NOT NULL,
    Quantity decimal(10,2) NOT NULL,
    UnitPrice decimal(12,2) NOT NULL,
    Amount AS CAST(Quantity * UnitPrice AS decimal(14,2)) PERSISTED,
    CONSTRAINT PK_BudgetItem PRIMARY KEY (BudgetItemId),
    CONSTRAINT FK_BudgetItem_Project FOREIGN KEY (ProjectId) REFERENCES Project (ProjectId) ON DELETE CASCADE,
    CONSTRAINT CK_BudgetItem_Quantity CHECK (Quantity > 0),
    CONSTRAINT CK_BudgetItem_Price CHECK (UnitPrice >= 0)
);

CREATE INDEX IX_BudgetItem_Project ON BudgetItem (ProjectId) INCLUDE (Amount);

CREATE TABLE Review (
    ReviewId int IDENTITY(1,1) NOT NULL,
    ProjectId int NOT NULL,
    ReviewerId int NOT NULL,
    ReviewType varchar(12) NOT NULL,
    Decision varchar(8) NOT NULL,
    Comment nvarchar(2000) NULL,
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_Review_CreatedAt DEFAULT SYSDATETIME(),
    CONSTRAINT PK_Review PRIMARY KEY (ReviewId),
    CONSTRAINT FK_Review_Project FOREIGN KEY (ProjectId) REFERENCES Project (ProjectId),
    CONSTRAINT FK_Review_Reviewer FOREIGN KEY (ReviewerId) REFERENCES UserAccount (UserId),
    CONSTRAINT CK_Review_Type CHECK (ReviewType IN ('moderation', 'technical', 'legal', 'financial')),
    CONSTRAINT CK_Review_Decision CHECK (Decision IN ('approve', 'revise', 'reject')),
    -- повернення і відхилення лише з коментарем
    CONSTRAINT CK_Review_Comment CHECK (Decision = 'approve' OR (Comment IS NOT NULL AND LEN(Comment) > 0))
);

CREATE INDEX IX_Review_Project ON Review (ProjectId, CreatedAt);
CREATE INDEX IX_Review_Reviewer ON Review (ReviewerId);

CREATE TABLE Subscription (
    UserId int NOT NULL,
    ProjectId int NOT NULL,
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_Subscription_CreatedAt DEFAULT SYSDATETIME(),
    CONSTRAINT PK_Subscription PRIMARY KEY (UserId, ProjectId),
    CONSTRAINT FK_Subscription_User FOREIGN KEY (UserId) REFERENCES UserAccount (UserId) ON DELETE CASCADE,
    CONSTRAINT FK_Subscription_Project FOREIGN KEY (ProjectId) REFERENCES Project (ProjectId) ON DELETE CASCADE
);

CREATE INDEX IX_Subscription_Project ON Subscription (ProjectId);

-- голосування

CREATE TABLE Vote (
    VoteId bigint IDENTITY(1,1) NOT NULL,
    VoterId int NOT NULL,
    ProjectId int NOT NULL,
    VoteCount tinyint NOT NULL CONSTRAINT DF_Vote_VoteCount DEFAULT 1,
    Channel varchar(6) NOT NULL,
    StationId smallint NULL,
    OperatorId int NULL,
    CastAt datetime2(3) NOT NULL CONSTRAINT DF_Vote_CastAt DEFAULT SYSDATETIME(),
    CONSTRAINT PK_Vote PRIMARY KEY (VoteId),
    CONSTRAINT UQ_Vote_Voter_Project UNIQUE (VoterId, ProjectId),
    CONSTRAINT FK_Vote_Voter FOREIGN KEY (VoterId) REFERENCES UserAccount (UserId),
    CONSTRAINT FK_Vote_Project FOREIGN KEY (ProjectId) REFERENCES Project (ProjectId),
    CONSTRAINT FK_Vote_Station FOREIGN KEY (StationId) REFERENCES PollingStation (StationId),
    CONSTRAINT FK_Vote_Operator FOREIGN KEY (OperatorId) REFERENCES UserAccount (UserId),
    CONSTRAINT CK_Vote_Count CHECK (VoteCount BETWEEN 1 AND 10),
    CONSTRAINT CK_Vote_Channel CHECK (Channel IN ('online', 'paper')),
    -- паперовий голос з пунктом і оператором, онлайн без них
    CONSTRAINT CK_Vote_Paper CHECK (
        (Channel = 'online' AND StationId IS NULL AND OperatorId IS NULL)
        OR (Channel = 'paper' AND StationId IS NOT NULL AND OperatorId IS NOT NULL))
);

CREATE INDEX IX_Vote_Project ON Vote (ProjectId) INCLUDE (VoteCount, Channel);

-- реалізація

CREATE TABLE Implementation (
    ImplementationId int IDENTITY(1,1) NOT NULL,
    ProjectId int NOT NULL,
    ContractorId int NOT NULL,
    PlannedBudget decimal(14,2) NOT NULL,
    StartDate date NOT NULL,
    PlannedEndDate date NOT NULL,
    ActualEndDate date NULL,
    Status varchar(12) NOT NULL CONSTRAINT DF_Implementation_Status DEFAULT 'planned',
    CreatedBy int NULL,
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_Implementation_CreatedAt DEFAULT SYSDATETIME(),
    CONSTRAINT PK_Implementation PRIMARY KEY (ImplementationId),
    CONSTRAINT UQ_Implementation_Project UNIQUE (ProjectId), -- 1:1
    CONSTRAINT FK_Implementation_Project FOREIGN KEY (ProjectId) REFERENCES Project (ProjectId),
    CONSTRAINT FK_Implementation_Contractor FOREIGN KEY (ContractorId) REFERENCES Contractor (ContractorId),
    CONSTRAINT FK_Implementation_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES UserAccount (UserId),
    CONSTRAINT CK_Implementation_Status CHECK (Status IN ('planned', 'in_progress', 'suspended', 'completed')),
    CONSTRAINT CK_Implementation_Budget CHECK (PlannedBudget > 0),
    CONSTRAINT CK_Implementation_Dates CHECK (StartDate <= PlannedEndDate AND (ActualEndDate IS NULL OR ActualEndDate >= StartDate)),
    CONSTRAINT CK_Implementation_Completed CHECK (Status <> 'completed' OR ActualEndDate IS NOT NULL)
);

CREATE INDEX IX_Implementation_Contractor ON Implementation (ContractorId);

CREATE TABLE ImplementationStage (
    StageId int IDENTITY(1,1) NOT NULL,
    ImplementationId int NOT NULL,
    StageNo tinyint NOT NULL,
    Name nvarchar(150) NOT NULL,
    PlannedEndDate date NOT NULL,
    PlannedCost decimal(14,2) NOT NULL,
    ActualCost decimal(14,2) NULL,
    Status varchar(12) NOT NULL CONSTRAINT DF_Stage_Status DEFAULT 'planned',
    CompletedAt date NULL,
    CONSTRAINT PK_ImplementationStage PRIMARY KEY (StageId),
    CONSTRAINT UQ_ImplementationStage_No UNIQUE (ImplementationId, StageNo),
    CONSTRAINT FK_ImplementationStage_Impl FOREIGN KEY (ImplementationId)
        REFERENCES Implementation (ImplementationId) ON DELETE CASCADE,
    CONSTRAINT CK_ImplementationStage_Status CHECK (Status IN ('planned', 'in_progress', 'done')),
    CONSTRAINT CK_ImplementationStage_Cost CHECK (PlannedCost >= 0 AND (ActualCost IS NULL OR ActualCost >= 0)),
    CONSTRAINT CK_ImplementationStage_Done CHECK (Status <> 'done' OR (CompletedAt IS NOT NULL AND ActualCost IS NOT NULL))
);

CREATE TABLE Report (
    ReportId int IDENTITY(1,1) NOT NULL,
    StageId int NOT NULL,
    AuthorId int NOT NULL,
    Body nvarchar(max) NOT NULL,
    Status varchar(10) NOT NULL CONSTRAINT DF_Report_Status DEFAULT 'submitted',
    SubmittedAt datetime2(0) NOT NULL CONSTRAINT DF_Report_SubmittedAt DEFAULT SYSDATETIME(),
    ReviewedBy int NULL,
    ReviewedAt datetime2(0) NULL,
    ReviewComment nvarchar(1000) NULL,
    CONSTRAINT PK_Report PRIMARY KEY (ReportId),
    CONSTRAINT FK_Report_Stage FOREIGN KEY (StageId) REFERENCES ImplementationStage (StageId) ON DELETE CASCADE,
    CONSTRAINT FK_Report_Author FOREIGN KEY (AuthorId) REFERENCES UserAccount (UserId),
    CONSTRAINT FK_Report_ReviewedBy FOREIGN KEY (ReviewedBy) REFERENCES UserAccount (UserId),
    CONSTRAINT CK_Report_Status CHECK (Status IN ('submitted', 'accepted', 'rejected')),
    CONSTRAINT CK_Report_Reviewed CHECK (Status = 'submitted' OR (ReviewedBy IS NOT NULL AND ReviewedAt IS NOT NULL))
);

CREATE INDEX IX_Report_Stage ON Report (StageId);

-- або проєкт, або звіт; самі файли в MinIO
CREATE TABLE Attachment (
    AttachmentId int IDENTITY(1,1) NOT NULL,
    ProjectId int NULL,
    ReportId int NULL,
    FileName nvarchar(255) NOT NULL,
    MimeType varchar(100) NOT NULL,
    StorageKey varchar(500) NOT NULL,
    SizeBytes int NOT NULL,
    UploadedBy int NOT NULL,
    UploadedAt datetime2(0) NOT NULL CONSTRAINT DF_Attachment_UploadedAt DEFAULT SYSDATETIME(),
    CONSTRAINT PK_Attachment PRIMARY KEY (AttachmentId),
    CONSTRAINT UQ_Attachment_StorageKey UNIQUE (StorageKey),
    CONSTRAINT FK_Attachment_Project FOREIGN KEY (ProjectId) REFERENCES Project (ProjectId) ON DELETE CASCADE,
    CONSTRAINT FK_Attachment_Report FOREIGN KEY (ReportId) REFERENCES Report (ReportId) ON DELETE CASCADE,
    CONSTRAINT FK_Attachment_UploadedBy FOREIGN KEY (UploadedBy) REFERENCES UserAccount (UserId),
    CONSTRAINT CK_Attachment_Owner CHECK (
        (ProjectId IS NOT NULL AND ReportId IS NULL) OR (ProjectId IS NULL AND ReportId IS NOT NULL)),
    CONSTRAINT CK_Attachment_Mime CHECK (MimeType IN ('image/jpeg', 'image/png', 'application/pdf')),
    CONSTRAINT CK_Attachment_Size CHECK (SizeBytes BETWEEN 1 AND 20971520) -- 20 МБ
);

CREATE INDEX IX_Attachment_Project ON Attachment (ProjectId) WHERE ProjectId IS NOT NULL;
CREATE INDEX IX_Attachment_Report ON Attachment (ReportId) WHERE ReportId IS NOT NULL;

-- сповіщення і аудит

CREATE TABLE Notification (
    NotificationId bigint IDENTITY(1,1) NOT NULL,
    UserId int NOT NULL,
    ProjectId int NULL,
    NotifType varchar(20) NOT NULL,
    Channel varchar(6) NOT NULL CONSTRAINT DF_Notification_Channel DEFAULT 'email',
    Body nvarchar(1000) NOT NULL,
    IsRead bit NOT NULL CONSTRAINT DF_Notification_IsRead DEFAULT 0,
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_Notification_CreatedAt DEFAULT SYSDATETIME(),
    SentAt datetime2(0) NULL,
    CONSTRAINT PK_Notification PRIMARY KEY (NotificationId),
    CONSTRAINT FK_Notification_User FOREIGN KEY (UserId) REFERENCES UserAccount (UserId) ON DELETE CASCADE,
    CONSTRAINT FK_Notification_Project FOREIGN KEY (ProjectId) REFERENCES Project (ProjectId) ON DELETE SET NULL,
    CONSTRAINT CK_Notification_Type CHECK (NotifType IN ('status_change', 'revision', 'report', 'results', 'system')),
    CONSTRAINT CK_Notification_Channel CHECK (Channel IN ('email', 'push', 'inapp'))
);

CREATE INDEX IX_Notification_User ON Notification (UserId, IsRead, CreatedAt DESC);
-- ще не відправлені
CREATE INDEX IX_Notification_Unsent ON Notification (CreatedAt) WHERE SentAt IS NULL;

CREATE TABLE AuditLog (
    AuditId bigint IDENTITY(1,1) NOT NULL,
    UserId int NULL, -- NULL для системних подій
    ActionCode varchar(30) NOT NULL,
    EntityName varchar(50) NOT NULL,
    EntityId bigint NULL,
    Details nvarchar(1000) NULL,
    IpAddress varchar(45) NULL,
    CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_AuditLog_CreatedAt DEFAULT SYSDATETIME(),
    CONSTRAINT PK_AuditLog PRIMARY KEY (AuditId),
    CONSTRAINT FK_AuditLog_User FOREIGN KEY (UserId) REFERENCES UserAccount (UserId)
);

CREATE INDEX IX_AuditLog_CreatedAt ON AuditLog (CreatedAt);
CREATE INDEX IX_AuditLog_Entity ON AuditLog (EntityName, EntityId);
CREATE INDEX IX_AuditLog_User ON AuditLog (UserId, CreatedAt) WHERE UserId IS NOT NULL;
GO

-- представлення

CREATE VIEW vw_ProjectCost
AS
SELECT p.ProjectId, p.CampaignId,
    ISNULL(SUM(b.Amount), 0) AS EstimatedCost,
    COUNT(b.BudgetItemId) AS ItemCount
FROM Project p
LEFT JOIN BudgetItem b ON b.ProjectId = p.ProjectId
GROUP BY p.ProjectId, p.CampaignId;
GO

CREATE VIEW vw_ProjectResult
AS
SELECT p.ProjectId, p.CampaignId, p.CategoryId, p.RegNumber, p.Title, p.Status,
    c.EstimatedCost,
    ISNULL(SUM(v.VoteCount), 0) AS TotalVotes,
    ISNULL(SUM(CASE WHEN v.Channel = 'online' THEN v.VoteCount END), 0) AS OnlineVotes,
    ISNULL(SUM(CASE WHEN v.Channel = 'paper' THEN v.VoteCount END), 0) AS PaperVotes,
    COUNT(v.VoteId) AS VoterCount
FROM Project p
JOIN vw_ProjectCost c ON c.ProjectId = p.ProjectId
LEFT JOIN Vote v ON v.ProjectId = p.ProjectId
WHERE p.Status IN ('published', 'winner', 'not_selected', 'implementing', 'completed')
GROUP BY p.ProjectId, p.CampaignId, p.CategoryId, p.RegNumber, p.Title, p.Status, c.EstimatedCost;
GO

CREATE VIEW vw_ImplementationProgress
AS
SELECT i.ImplementationId, i.ProjectId, i.ContractorId, i.Status, i.PlannedBudget,
    ISNULL(SUM(s.ActualCost), 0) AS ActualCost,
    COUNT(s.StageId) AS StagesTotal,
    ISNULL(SUM(CASE WHEN s.Status = 'done' THEN 1 ELSE 0 END), 0) AS StagesDone
FROM Implementation i
LEFT JOIN ImplementationStage s ON s.ImplementationId = i.ImplementationId
GROUP BY i.ImplementationId, i.ProjectId, i.ContractorId, i.Status, i.PlannedBudget;
GO

-- тригери

-- перевірки голосу
CREATE TRIGGER TR_Vote_CheckRules
ON Vote
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN Project p ON p.ProjectId = i.ProjectId
        JOIN Campaign c ON c.CampaignId = p.CampaignId
        WHERE p.Status <> 'published'
            OR (i.Channel = 'online' AND (c.Status <> 'voting'
                OR CAST(i.CastAt AS date) NOT BETWEEN c.VotingStart AND c.VotingEnd))
            -- паперові можна вносити ще під час підрахунку
            OR (i.Channel = 'paper' AND c.Status NOT IN ('voting', 'counting'))
    )
        THROW 50001, N'Голосування за цей проєкт зараз недоступне.', 1;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN UserAccount u ON u.UserId = i.VoterId
        JOIN Project p ON p.ProjectId = i.ProjectId
        JOIN Campaign c ON c.CampaignId = p.CampaignId
        WHERE u.VerificationStatus <> 'verified'
            OR u.IsBlocked = 1
            OR DATEADD(year, c.MinVoterAge, u.BirthDate) > CAST(i.CastAt AS date)
    )
        THROW 50002, N'Виборець не верифікований, заблокований або не досяг мінімального віку.', 1;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN Project p ON p.ProjectId = i.ProjectId
        JOIN Campaign c ON c.CampaignId = p.CampaignId
        WHERE i.VoteCount > c.MaxVotesPerProject
    )
        THROW 50003, N'Перевищено кількість голосів за один проєкт.', 1;

    -- сума голосів виборця в кампанії
    IF EXISTS (
        SELECT 1
        FROM Vote v
        JOIN Project p ON p.ProjectId = v.ProjectId
        JOIN Campaign c ON c.CampaignId = p.CampaignId
        WHERE EXISTS (
            SELECT 1
            FROM inserted i
            JOIN Project ip ON ip.ProjectId = i.ProjectId
            WHERE i.VoterId = v.VoterId AND ip.CampaignId = p.CampaignId
        )
        GROUP BY v.VoterId, p.CampaignId, c.VotesPerVoter
        HAVING SUM(v.VoteCount) > c.VotesPerVoter
    )
        THROW 50004, N'Перевищено загальну кількість голосів виборця в кампанії.', 1;

    -- або онлайн, або на пункті
    IF EXISTS (
        SELECT 1
        FROM Vote v
        JOIN Project p ON p.ProjectId = v.ProjectId
        WHERE EXISTS (
            SELECT 1
            FROM inserted i
            JOIN Project ip ON ip.ProjectId = i.ProjectId
            WHERE i.VoterId = v.VoterId AND ip.CampaignId = p.CampaignId
        )
        GROUP BY v.VoterId, p.CampaignId
        HAVING COUNT(DISTINCT v.Channel) > 1
    )
        THROW 50005, N'Виборець уже голосував у цій кампанії іншим способом.', 1;
END;
GO

-- аудит і сповіщення при зміні статусу
-- UserId та Ip застосунок кладе через sp_set_session_context
CREATE TRIGGER TR_Project_StatusChange
ON Project
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(Status) RETURN;

    DECLARE @UserId int = TRY_CAST(SESSION_CONTEXT(N'UserId') AS int);
    DECLARE @Ip varchar(45) = TRY_CAST(SESSION_CONTEXT(N'Ip') AS varchar(45));

    INSERT INTO AuditLog (UserId, ActionCode, EntityName, EntityId, Details, IpAddress)
    SELECT @UserId, 'project_status', 'Project', i.ProjectId,
        CONCAT(N'було ', d.Status, N', стало ', i.Status), @Ip
    FROM inserted i
    JOIN deleted d ON d.ProjectId = i.ProjectId
    WHERE i.Status <> d.Status;

    INSERT INTO Notification (UserId, ProjectId, NotifType, Body)
    SELECT r.UserId, i.ProjectId,
        CASE WHEN i.Status = 'revision' THEN 'revision' ELSE 'status_change' END,
        CONCAT(N'Проєкт ', i.RegNumber, N' "', i.Title, N'": ', s.StatusName)
    FROM inserted i
    JOIN deleted d ON d.ProjectId = i.ProjectId
    CROSS APPLY (
        SELECT CASE i.Status
            WHEN 'revision' THEN N'повернуто на доопрацювання'
            WHEN 'rejected' THEN N'відхилено'
            WHEN 'published' THEN N'допущено до голосування'
            WHEN 'winner' THEN N'став переможцем'
            WHEN 'not_selected' THEN N'не пройшов за кількістю голосів'
            WHEN 'implementing' THEN N'розпочато реалізацію'
            WHEN 'completed' THEN N'реалізовано'
        END AS StatusName
    ) s
    CROSS APPLY (
        SELECT i.AuthorId AS UserId
        UNION
        SELECT sb.UserId FROM Subscription sb WHERE sb.ProjectId = i.ProjectId
    ) r
    WHERE i.Status <> d.Status
        AND s.StatusName IS NOT NULL;
END;
GO

-- процедури

-- подання проєкту
CREATE PROCEDURE usp_SubmitProject
    @ProjectId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CampaignId smallint, @AuthorId int, @Status varchar(15), @RegNumber varchar(20);
    DECLARE @HasDescription bit, @HasPlace bit, @Cost decimal(14,2);
    DECLARE @MinCost decimal(12,2), @MaxCost decimal(12,2), @MaxProjects tinyint;
    DECLARE @Year smallint, @CampaignStatus varchar(15), @SubmissionEnd date;

    BEGIN TRANSACTION;

    SELECT @CampaignId = p.CampaignId, @AuthorId = p.AuthorId, @Status = p.Status, @RegNumber = p.RegNumber,
        @HasDescription = CASE WHEN LEN(p.Description) > 0 THEN 1 ELSE 0 END,
        @HasPlace = CASE WHEN p.Location IS NOT NULL OR p.Address IS NOT NULL THEN 1 ELSE 0 END,
        @MinCost = c.MinProjectCost, @MaxCost = c.MaxProjectCost, @MaxProjects = c.MaxProjectsPerAuthor,
        @Year = c.CampaignYear, @CampaignStatus = c.Status, @SubmissionEnd = c.SubmissionEnd
    FROM Project p WITH (UPDLOCK)
    JOIN Campaign c ON c.CampaignId = p.CampaignId
    WHERE p.ProjectId = @ProjectId;

    IF @Status IS NULL
        THROW 50010, N'Проєкт не знайдено.', 1;
    IF @Status NOT IN ('draft', 'revision')
        THROW 50011, N'Подати можна лише чернетку або проєкт, повернутий на доопрацювання.', 1;
    IF @Status = 'draft' AND (@CampaignStatus <> 'submission' OR CAST(SYSDATETIME() AS date) > @SubmissionEnd)
        THROW 50012, N'Прийом проєктів у цій кампанії не триває.', 1;
    IF @HasDescription = 0 OR @HasPlace = 0
        THROW 50013, N'Не заповнено опис або місце реалізації.', 1;

    SELECT @Cost = EstimatedCost FROM vw_ProjectCost WHERE ProjectId = @ProjectId;
    IF @Cost < @MinCost OR @Cost > @MaxCost
        THROW 50014, N'Вартість проєкту виходить за межі, встановлені кампанією.', 1;

    IF @Status = 'draft' AND (
        SELECT COUNT(*) FROM Project
        WHERE CampaignId = @CampaignId AND AuthorId = @AuthorId AND Status <> 'draft' AND ProjectId <> @ProjectId
    ) >= @MaxProjects
        THROW 50015, N'Автор уже подав максимальну кількість проєктів у цій кампанії.', 1;

    IF @RegNumber IS NULL
    BEGIN
        DECLARE @N int;
        SELECT @N = ISNULL(MAX(CAST(RIGHT(RegNumber, 4) AS int)), 0) + 1
        FROM Project WITH (UPDLOCK, HOLDLOCK)
        WHERE CampaignId = @CampaignId AND RegNumber IS NOT NULL;

        SET @RegNumber = CONCAT('GB-', @Year, '-', RIGHT(CONCAT('0000', @N), 4));
    END

    UPDATE Project
    SET Status = 'submitted', RegNumber = @RegNumber, SubmittedAt = SYSDATETIME(), UpdatedAt = SYSDATETIME()
    WHERE ProjectId = @ProjectId;

    COMMIT TRANSACTION;

    SELECT @ProjectId AS ProjectId, @RegNumber AS RegNumber, @Cost AS EstimatedCost;
END;
GO

-- переможці: за рейтингом у категорії, поки вистачає ліміту
CREATE PROCEDURE usp_SelectWinners
    @CampaignId smallint
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM Campaign WHERE CampaignId = @CampaignId AND Status = 'counting')
        THROW 50020, N'Кампанія не на етапі підрахунку голосів.', 1;

    DECLARE @Rating TABLE (
        ProjectId int PRIMARY KEY,
        CategoryId tinyint NOT NULL,
        Cost decimal(14,2) NOT NULL,
        Votes int NOT NULL,
        Place int NOT NULL
    );
    DECLARE @BudgetLeft TABLE (CategoryId tinyint PRIMARY KEY, Amount decimal(14,2) NOT NULL);
    DECLARE @Winner TABLE (ProjectId int PRIMARY KEY);

    INSERT INTO @Rating (ProjectId, CategoryId, Cost, Votes, Place)
    SELECT r.ProjectId, r.CategoryId, r.EstimatedCost, r.TotalVotes,
        ROW_NUMBER() OVER (PARTITION BY r.CategoryId ORDER BY r.TotalVotes DESC, r.VoterCount DESC, r.ProjectId)
    FROM vw_ProjectResult r
    WHERE r.CampaignId = @CampaignId AND r.Status = 'published';

    INSERT INTO @BudgetLeft (CategoryId, Amount)
    SELECT CategoryId, BudgetLimit FROM CampaignCategory WHERE CampaignId = @CampaignId;

    DECLARE @ProjectId int, @CategoryId tinyint, @Cost decimal(14,2);

    DECLARE rating_cursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT ProjectId, CategoryId, Cost FROM @Rating WHERE Votes > 0 ORDER BY CategoryId, Place;

    OPEN rating_cursor;
    FETCH NEXT FROM rating_cursor INTO @ProjectId, @CategoryId, @Cost;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        IF @Cost <= (SELECT Amount FROM @BudgetLeft WHERE CategoryId = @CategoryId)
        BEGIN
            INSERT INTO @Winner (ProjectId) VALUES (@ProjectId);
            UPDATE @BudgetLeft SET Amount = Amount - @Cost WHERE CategoryId = @CategoryId;
        END

        FETCH NEXT FROM rating_cursor INTO @ProjectId, @CategoryId, @Cost;
    END

    CLOSE rating_cursor;
    DEALLOCATE rating_cursor;

    BEGIN TRANSACTION;

    UPDATE p
    SET Status = CASE WHEN w.ProjectId IS NOT NULL THEN 'winner' ELSE 'not_selected' END,
        UpdatedAt = SYSDATETIME()
    FROM Project p
    LEFT JOIN @Winner w ON w.ProjectId = p.ProjectId
    WHERE p.CampaignId = @CampaignId AND p.Status = 'published';

    UPDATE Campaign SET Status = 'implementation' WHERE CampaignId = @CampaignId;

    COMMIT TRANSACTION;

    SELECT r.CategoryId, r.Place, r.ProjectId, r.Votes, r.Cost,
        CASE WHEN w.ProjectId IS NULL THEN 0 ELSE 1 END AS IsWinner
    FROM @Rating r
    LEFT JOIN @Winner w ON w.ProjectId = r.ProjectId
    ORDER BY r.CategoryId, r.Place;
END;
GO

-- початкові дані

INSERT INTO AppRole (Code, Name) VALUES
('resident', N'Мешканець-виборець'),
('moderator', N'Модератор'),
('expert', N'Експерт'),
('operator', N'Оператор пункту голосування'),
('executor', N'Виконавець'),
('admin', N'Адміністратор системи');

INSERT INTO Category (Name, Description) VALUES
(N'Інфраструктура', N'Дороги, тротуари, освітлення, зупинки'),
(N'Озеленення', N'Сквери, парки, клумби, висадка дерев'),
(N'Культура', N'Фестивалі, бібліотеки, мистецькі простори'),
(N'Освіта', N'Обладнання для шкіл і садків, освітні програми'),
(N'Спорт', N'Спортивні та дитячі майданчики, секції'),
(N'Безпека', N'Відеоспостереження, укриття, безбар''єрність');

-- райони для прикладу
INSERT INTO District (Name) VALUES
(N'Голосіївський'), (N'Дарницький'), (N'Деснянський'), (N'Дніпровський'), (N'Оболонський'),
(N'Печерський'), (N'Подільський'), (N'Святошинський'), (N'Солом''янський'), (N'Шевченківський');
GO
