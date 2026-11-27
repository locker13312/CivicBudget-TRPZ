# Діаграма класів бекенду

Дві діаграми — фрагменти проєктів `CivicBudget.DAL` і `CivicBudget.Api`. Показано класи, через які проходять
основні сценарії (подання, голосування, визначення переможців); сутності EF — лише ті, що беруть участь у них.
Картинки: `class-dal.png`, `class-api.png` (згенеровано з цього файлу).

Позначення: `<|..` — реалізує інтерфейс, `-->` — використовує (залежність через конструктор), `*--` — композиція.

## Фрагмент DAL

```mermaid
classDiagram
direction TB
class CivicBudgetContext {
  +DbSet~Project~ Projects
  +DbSet~Vote~ Votes
  +DbSet~Campaign~ Campaigns
  +DbSet~VwProjectResult~ VwProjectResults
  +DbSet~VwProjectCost~ VwProjectCosts
}
class IProjectRepository {
  <<interface>>
  +SearchAsync(filter, statuses) PagedResult
  +GetDetailsAsync(id) ProjectDetails
  +GetResultsAsync(campaignId) List~ResultRow~
  +SaveAsync()
}
class ProjectRepository {
  -Filtered(filter, statuses) IQueryable
  -WithCostAndVotes(source) IQueryable
}
class IVoteRepository {
  <<interface>>
  +GetAsync(voterId, projectId) Vote
  +Add(vote)
  +SaveAsync()
}
class IProcedureRepository {
  <<interface>>
  +SubmitProjectAsync(projectId) SubmitResult
  +SelectWinnersAsync(campaignId) List~WinnerRow~
}
class ProcedureRepository {
  ADO.NET: SqlCommand + SqlDataReader
}
class IFunctionRepository {
  <<interface>>
  +GetRemainingVotesAsync(voterId, campaignId) int
  +GetCategoryBalanceAsync(campaignId) List~CategoryBalance~
  +FindVotersAsync(name, birthDate, campaignId) List~VoterStatus~
}
class FunctionRepository {
  ADO.NET: ExecuteScalar, SqlDataReader
}
class IAuditRepository {
  <<interface>>
  +GetPageAsync(filter) PagedResult
  +WriteAsync(userId, action, entity, id, details)
  +GetProjectStatusHistoryAsync(projectId)
}
class AuditRepository {
  ADO.NET: SqlDataAdapter, DataSet, DataView
}
class SqlConnectionFactory {
  +OpenAsync() SqlConnection
}
class SessionContextInterceptor {
  +ConnectionOpened() sp_set_session_context
}
class DbErrors {
  <<static>>
  +Translate(ex) BusinessRuleException
  +Run(action)
}
class BusinessRuleException {
  +int Code
}
class Project {
  +int ProjectId
  +string Status
  +string RegNumber
}
class Vote {
  +long VoteId
  +int VoterId
  +byte VoteCount
  +string Channel
}
class Campaign {
  +short CampaignId
  +string Status
  +byte VotesPerVoter
  +byte MaxVotesPerProject
}
IProjectRepository <|.. ProjectRepository
IProcedureRepository <|.. ProcedureRepository
IFunctionRepository <|.. FunctionRepository
IAuditRepository <|.. AuditRepository
ProjectRepository --> CivicBudgetContext
ProcedureRepository --> SqlConnectionFactory
FunctionRepository --> SqlConnectionFactory
AuditRepository --> SqlConnectionFactory
CivicBudgetContext --> SessionContextInterceptor
CivicBudgetContext *-- Project
CivicBudgetContext *-- Vote
CivicBudgetContext *-- Campaign
Campaign "1" --> "*" Project
Project "1" --> "*" Vote
DbErrors --> BusinessRuleException
```

## Фрагмент Api

```mermaid
classDiagram
direction LR
class VotingController {
  <<Authorize resident>>
  +My() MyBallot
  +Cast(projectId) MyBallot
}
class MyProjectsController {
  <<Authorize resident>>
  +Update(id, dto)
  +Submit(id) SubmitResult
}
class ModerationController {
  <<Authorize moderator>>
  +Decide(id, dto)
  +Assign(id, dto)
  +Publish(id)
}
class AdminController {
  <<Authorize admin>>
  +SetStatus(id, dto)
  +StatusCheck(id, to) StageTransitionCheck
  +SelectWinners(id) RatingResponse
}
class OperatorController {
  <<Authorize operator>>
  +Voters(name, birthDate) List~VoterStatus~
  +Ballot(dto)
}
class VotingService {
  +GetMyBallotAsync(voterId) MyBallot
  +CastAsync(voterId, projectId) MyBallot
  +AddPaperBallotAsync(operatorId, dto) int
  +FindVotersAsync(name, birthDate)
}
class ProjectService {
  +SubmitAsync(projectId, authorId) SubmitResult
  +ModerateAsync(projectId, moderatorId, dto)
  +AssignModeratorAsync(projectId, moderatorId) string
  +PublishAsync(projectId, moderatorId)
}
class CampaignService {
  +CheckTransitionAsync(id, to) StageTransitionCheck
  +SetStatusAsync(id, status, adminId)
  +SelectWinnersAsync(id) RatingResponse
  +GetRatingAsync(id) RatingResponse
}
class AuthService {
  +LoginAsync(request) LoginResponse
  +VerifyTwoFactorAsync(request) AuthResponse
  +ResendTwoFactorAsync(challengeId)
}
class JwtTokenService {
  +Issue(user) TokenPair
  +ValidateRefresh(token) int
}
class ErrorHandlingMiddleware {
  +InvokeAsync(context)
}
class ResultsHub {
  SignalR: votesChanged
}
VotingController --> VotingService
OperatorController --> VotingService
MyProjectsController --> ProjectService
ModerationController --> ProjectService
AdminController --> CampaignService
VotingService --> IVoteRepository
VotingService --> IFunctionRepository
VotingService --> ResultsHub
ProjectService --> IProjectRepository
ProjectService --> IProcedureRepository
CampaignService --> IProcedureRepository
CampaignService --> IFunctionRepository
AuthService --> JwtTokenService
class IVoteRepository { <<interface>> }
class IFunctionRepository { <<interface>> }
class IProjectRepository { <<interface>> }
class IProcedureRepository { <<interface>> }
```

Запит проходить шари так: контролер (перевірка ролі) → сервіс (бізнес-логіка) → репозиторій DAL (EF Core або ADO.NET) →
SQL Server (тригери, процедури, функції). Помилку з БД `DbErrors` перекладає в `BusinessRuleException`,
а `ErrorHandlingMiddleware` повертає її як HTTP 400 з текстом для користувача.
