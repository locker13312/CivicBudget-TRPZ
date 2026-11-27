using CivicBudget.Api.Dto;
using CivicBudget.Api.Hubs;
using CivicBudget.Api.Infrastructure;
using CivicBudget.Api.Services;
using CivicBudget.DAL.Entities;
using CivicBudget.DAL.Infrastructure;
using CivicBudget.DAL.Models;
using CivicBudget.DAL.Repositories;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Configuration;
using NSubstitute;

namespace CivicBudget.Tests;

/// <summary>
/// Модульні тести правил, що живуть у сервісах (без БД): репозиторії підмінено NSubstitute.
/// Правила голосування й подання, які перевіряє сама БД, — у <see cref="DatabaseRulesTests"/>.
/// </summary>
public class ServiceRulesTests
{
    private readonly IProjectRepository _projects = Substitute.For<IProjectRepository>();
    private readonly ICampaignRepository _campaigns = Substitute.For<ICampaignRepository>();
    private readonly IProcedureRepository _procedures = Substitute.For<IProcedureRepository>();
    private readonly IUserRepository _users = Substitute.For<IUserRepository>();
    private readonly IVoteRepository _votes = Substitute.For<IVoteRepository>();
    private readonly IFunctionRepository _functions = Substitute.For<IFunctionRepository>();
    private readonly IStatisticsRepository _stats = Substitute.For<IStatisticsRepository>();

    private VotingService CreateVotingService() => new(_campaigns, _projects, _votes, Hub(), _functions);

    private CampaignService CreateCampaignService() =>
        new(_campaigns, _projects, _procedures, _stats, Substitute.For<IAuditRepository>(), Hub(), _functions);

    private static CampaignModel Campaign(string status, bool interim = true, params CampaignCategoryModel[] categories) =>
        new(2, 2026, "ГБ 2026", 6_000_000, 50_000, 1_500_000, 5, 2, 5, 16,
            new DateOnly(2026, 9, 1), new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 20),
            new DateOnly(2026, 11, 1), new DateOnly(2026, 12, 20), new DateOnly(2026, 12, 27), interim, status, categories);

    private ProjectService CreateProjectService()
    {
        var env = Substitute.For<IWebHostEnvironment>();
        env.ContentRootPath.Returns(Path.Combine(Path.GetTempPath(), "civicbudget-tests"));
        var files = new FileStorage(new ConfigurationBuilder().Build(), env);
        return new ProjectService(_projects, _campaigns, _procedures, Substitute.For<IAttachmentRepository>(), _users, files,
            Substitute.For<IAuditRepository>());
    }

    private static IHubContext<ResultsHub> Hub()
    {
        var hub = Substitute.For<IHubContext<ResultsHub>>();
        hub.Clients.All.Returns(Substitute.For<IClientProxy>());
        return hub;
    }

    private Project Project(int id, string status, int authorId = 6) =>
        new() { ProjectId = id, Status = status, AuthorId = authorId, Title = "Проєкт", CampaignId = 2 };

    // ---------- голосування ----------

    [Fact]
    public async Task OnlineVote_OnTopOfPaperBallot_IsRejectedWith50005()
    {
        // UPDATE VoteCount не змінює Channel, тож тригер такого не побачить — правило дублюється в сервісі
        _votes.GetAsync(9, 8).Returns(new Vote { VoterId = 9, ProjectId = 8, VoteCount = 1, Channel = "paper" });
        var service = CreateVotingService();

        var ex = await Assert.ThrowsAsync<BusinessRuleException>(() => service.CastAsync(9, 8));

        Assert.Equal(50005, ex.Code);
        await _votes.DidNotReceive().SaveAsync();
    }

    [Fact]
    public async Task SecondOnlineVote_IncrementsExistingRow()
    {
        var vote = new Vote { VoterId = 7, ProjectId = 8, VoteCount = 1, Channel = "online" };
        _votes.GetAsync(7, 8).Returns(vote);
        var service = CreateVotingService();

        await service.CastAsync(7, 8);

        Assert.Equal(2, vote.VoteCount);
        await _votes.Received(1).SaveAsync();
    }

    [Fact]
    public async Task FirstOnlineVote_AddsNewRow()
    {
        _votes.GetAsync(7, 8).Returns((Vote?)null);
        var service = CreateVotingService();

        await service.CastAsync(7, 8);

        _votes.Received(1).Add(Arg.Is<Vote>(v => v.VoterId == 7 && v.ProjectId == 8 && v.VoteCount == 1 && v.Channel == "online"));
    }

    // ---------- подання ----------

    [Fact]
    public async Task Submit_ForeignProject_IsForbidden()
    {
        _projects.GetEntityAsync(16).Returns(Project(16, "revision", authorId: 6));

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => CreateProjectService().SubmitAsync(16, authorId: 7));
        await _procedures.DidNotReceive().SubmitProjectAsync(Arg.Any<int>());
    }

    [Fact]
    public async Task Submit_CallsStoredProcedure()
    {
        _projects.GetEntityAsync(16).Returns(Project(16, "revision"));
        _procedures.SubmitProjectAsync(16).Returns(new SubmitResult(16, "GB-2026-0009", 225000));

        var result = await CreateProjectService().SubmitAsync(16, authorId: 6);

        Assert.Equal("GB-2026-0009", result.RegNumber);
    }

    // ---------- модерація ----------

    [Theory]
    [InlineData("reject")]
    [InlineData("revise")]
    public async Task Moderation_RejectOrReviseWithoutComment_IsRejected(string decision)
    {
        _projects.GetEntityAsync(14).Returns(Project(14, "moderation"));

        await Assert.ThrowsAsync<BusinessRuleException>(() =>
            CreateProjectService().ModerateAsync(14, 2, new ModerationDecisionDto(decision, "  ")));
        await _projects.DidNotReceive().SaveAsync();
    }

    [Fact]
    public async Task Moderation_Approve_KeepsModerationStatusAndAssignsModerator()
    {
        var project = Project(14, "submitted");
        _projects.GetEntityAsync(14).Returns(project);

        await CreateProjectService().ModerateAsync(14, 2, new ModerationDecisionDto("approve", null));

        Assert.Equal("moderation", project.Status);
        Assert.Equal(2, project.ModeratorId);
        _projects.Received(1).AddReview(Arg.Is<Review>(r => r.Decision == "approve" && r.ReviewType == "moderation"));
    }

    [Fact]
    public async Task Moderation_Duplicate_LinksOriginalAndRejects()
    {
        var project = Project(14, "moderation");
        _projects.GetEntityAsync(14).Returns(project);
        _projects.GetEntityAsync(7).Returns(new Project { ProjectId = 7, RegNumber = "GB-2026-0001", Title = "Оригінал", Status = "published" });

        await CreateProjectService().ModerateAsync(14, 2, new ModerationDecisionDto("duplicate", null, DuplicateOfId: 7));

        Assert.Equal("rejected", project.Status);
        Assert.Equal(7, project.DuplicateOfId);
        _projects.Received(1).AddReview(Arg.Is<Review>(r => r.Decision == "reject" && r.Comment!.Contains("GB-2026-0001")));
    }

    [Fact]
    public async Task Moderation_DuplicateWithoutOriginal_IsRejected()
    {
        _projects.GetEntityAsync(14).Returns(Project(14, "moderation"));

        await Assert.ThrowsAsync<BusinessRuleException>(() =>
            CreateProjectService().ModerateAsync(14, 2, new ModerationDecisionDto("duplicate", null)));
    }

    [Fact]
    public async Task Moderation_ProjectNotInQueue_IsRejected()
    {
        _projects.GetEntityAsync(7).Returns(Project(7, "published"));

        await Assert.ThrowsAsync<BusinessRuleException>(() =>
            CreateProjectService().ModerateAsync(7, 2, new ModerationDecisionDto("approve", null)));
    }

    // ---------- схожі проєкти ----------

    [Fact]
    public void KeyWords_TruncateEndingsAndDropCommonWords()
    {
        var words = ProjectService.KeyWords("Спортивний майданчик біля ліцею", "Облаштування майданчика для проєкту");

        Assert.Contains("майдан", words);        // «майданчик» і «майданчика» дають одне слово
        Assert.Contains("спорти", words);
        Assert.DoesNotContain("облашт", words);  // загальне слово
        Assert.DoesNotContain("біля", words);    // коротше 5 літер
        Assert.Equal(words.Count, words.Distinct().Count());
    }

    // ---------- кампанія ----------

    [Fact]
    public async Task CampaignUpdate_StagesOutOfOrder_IsRejected()
    {
        _campaigns.GetEntityAsync(2).Returns(new Campaign { CampaignId = 2, Name = "ГБ", Status = "voting" });
        var dto = new CampaignEditDto
        {
            CampaignYear = 2026,
            Name = "ГБ 2026",
            TotalBudget = 6_000_000,
            MinProjectCost = 50_000,
            MaxProjectCost = 1_500_000,
            SubmissionStart = new DateOnly(2026, 9, 1),
            SubmissionEnd = new DateOnly(2026, 10, 1),
            ReviewEnd = new DateOnly(2026, 12, 1),
            VotingStart = new DateOnly(2026, 11, 1),   // голосування раніше, ніж закінчився розгляд
            VotingEnd = new DateOnly(2026, 12, 20),
            ResultsDate = new DateOnly(2027, 1, 1),
        };

        await Assert.ThrowsAsync<BusinessRuleException>(() => CreateCampaignService().UpdateAsync(2, dto, adminId: 1));
        await _campaigns.DidNotReceive().SaveAsync();
    }

    // ---------- етапи кампанії ----------

    [Theory]
    [InlineData("voting", "counting", true)]      // наступний етап
    [InlineData("voting", "review", true)]        // один крок назад до підрахунку
    [InlineData("submission", "voting", false)]   // через етап
    [InlineData("counting", "voting", false)]     // назад після підрахунку
    [InlineData("counting", "implementation", false)] // лише через «Визначити переможців»
    [InlineData("implementation", "counting", false)]
    [InlineData("implementation", "closed", true)]
    public async Task StageTransition_FollowsSequence(string from, string to, bool allowed)
    {
        _campaigns.GetModelAsync(2).Returns(Campaign(from));
        _stats.GetByStatusAsync(2).Returns(new List<StatusStat>());
        _stats.GetBudgetUsageAsync(2).Returns(new BudgetUsageStat(0, 0, 0, 0, 0));

        var check = await CreateCampaignService().CheckTransitionAsync(2, to);

        Assert.Equal(allowed, check.Allowed);
    }

    [Fact]
    public async Task StageTransition_ToVoting_WarnsAboutUnreviewedProjects()
    {
        _campaigns.GetModelAsync(2).Returns(Campaign("review"));
        _stats.GetByStatusAsync(2).Returns(new List<StatusStat> { new("published", 6), new("moderation", 2), new("expertise", 1) });

        var check = await CreateCampaignService().CheckTransitionAsync(2, "voting");

        Assert.True(check.Allowed);
        Assert.Contains(check.Warnings, w => w.Contains("Ще не розглянуто проєктів: 3"));
    }

    [Fact]
    public async Task SetStatus_SkippingStage_IsRejectedWithoutSaving()
    {
        _campaigns.GetModelAsync(2).Returns(Campaign("submission"));
        _stats.GetByStatusAsync(2).Returns(new List<StatusStat>());

        await Assert.ThrowsAsync<BusinessRuleException>(() => CreateCampaignService().SetStatusAsync(2, "voting", adminId: 1));
        await _campaigns.DidNotReceive().SaveAsync();
    }

    // ---------- визначення переможців ----------

    [Fact]
    public async Task Rating_ExplainsWhyProjectDidNotFitAndAppliesTieRule()
    {
        // Спорт, ліміт 600 000: №7 (350 000, 17 голосів) проходить; №8 (300 000, 15) уже не вміщується в залишок 250 000;
        // №9 і №10 мають по 7 голосів — вище той, за кого голосувало більше виборців; №11 без голосів.
        _campaigns.GetModelAsync(2).Returns(Campaign("counting", true, new CampaignCategoryModel(5, "Спорт", 600000)));
        _projects.GetResultsAsync(2).Returns(new List<ResultRow>
        {
            new(10, "GB-2026-0010", "Корт", "published", 5, "Спорт", "Дарницький", 90000, 7, 7, 0, 4),
            new(8, "GB-2026-0002", "Скейт-парк", "published", 5, "Спорт", "Оболонський", 300000, 15, 14, 1, 15),
            new(7, "GB-2026-0001", "Майданчик", "published", 5, "Спорт", "Голосіївський", 350000, 17, 17, 0, 9),
            new(9, "GB-2026-0003", "Тенісні столи", "published", 5, "Спорт", "Дніпровський", 120000, 7, 7, 0, 6),
            new(11, "GB-2026-0011", "Турнік", "published", 5, "Спорт", "Подільський", 60000, 0, 0, 0, 0),
        });
        _functions.GetCategoryBalanceAsync(2).Returns(new List<CategoryBalance>());

        var rating = await CreateCampaignService().GetRatingAsync(2);

        Assert.False(rating.Final);
        Assert.Equal(new[] { 7, 8, 9, 10, 11 }, rating.Rows.Select(r => r.ProjectId));
        Assert.True(rating.Rows[0].IsWinner);
        Assert.False(rating.Rows[1].IsWinner);
        Assert.Equal(250000, rating.Rows[1].BalanceBefore);
        Assert.Contains("Не вміщується", rating.Rows[1].Reason);
        Assert.True(rating.Rows[2].IsWinner);   // 120 000 ≤ 250 000
        Assert.True(rating.Rows[3].IsWinner);   // 90 000 ≤ 130 000
        Assert.False(rating.Rows[4].IsWinner);
        Assert.Equal("Немає жодного голосу", rating.Rows[4].Reason);
    }

    [Fact]
    public async Task SelectWinners_CallsProcedureAndReturnsFinalRating()
    {
        _campaigns.GetModelAsync(2).Returns(Campaign("implementation", true, new CampaignCategoryModel(5, "Спорт", 600000)));
        _projects.GetResultsAsync(2).Returns(new List<ResultRow>
        {
            new(8, "GB-2026-0002", "Скейт-парк", "not_selected", 5, "Спорт", "Оболонський", 300000, 15, 14, 1, 15),
        });
        _functions.GetCategoryBalanceAsync(2).Returns(new List<CategoryBalance> { new(5, "Спорт", 600000, 470000, 130000, 2) });

        var rating = await CreateCampaignService().SelectWinnersAsync(2);

        await _procedures.Received(1).SelectWinnersAsync(2);
        Assert.True(rating.Final);
        Assert.False(rating.Rows.Single().IsWinner);
        Assert.Equal(130000, rating.Balances.Single().Balance);
    }

    [Fact]
    public async Task Rating_BeforeVotingEnds_IsNotAvailable()
    {
        _campaigns.GetModelAsync(2).Returns(Campaign("voting"));

        await Assert.ThrowsAsync<BusinessRuleException>(() => CreateCampaignService().GetRatingAsync(2));
    }

    // ---------- голосування: залишок і приховані результати ----------

    [Fact]
    public async Task Ballot_RemainingComesFromDatabaseFunction_AndVotesHiddenWithoutInterimResults()
    {
        _campaigns.GetCurrentAsync().Returns(Campaign("voting", interim: false));
        _votes.GetVoterVotesAsync(7, 2).Returns(new List<VoteModel> { new(8, 2, "online") });
        _functions.GetRemainingVotesAsync(7, 2).Returns(3);
        _projects.SearchAsync(Arg.Any<ProjectFilter>(), Arg.Any<IReadOnlyCollection<string>>()).Returns(
            new PagedResult<ProjectListItem>(new[]
            {
                new ProjectListItem(8, 2, "GB-2026-0002", "Скейт-парк", null, "published", 5, "Спорт", 5, "Оболонський",
                    300000, 15, "Савченко Наталія", DateTime.Now, null, null)
            }, 1, 1, 100));

        var ballot = await CreateVotingService().GetMyBallotAsync(7);

        Assert.Equal(3, ballot.Remaining);
        Assert.True(ballot.VotesHidden);
        Assert.Equal(0, ballot.Projects.Single().TotalVotes);
        Assert.Equal(2, ballot.Projects.Single().MyVotes);
    }

    // ---------- конфлікт інтересів і маршрутизація ----------

    [Fact]
    public async Task Moderation_OwnProject_IsRejected()
    {
        _projects.GetEntityAsync(14).Returns(Project(14, "moderation", authorId: 2));

        await Assert.ThrowsAsync<BusinessRuleException>(() =>
            CreateProjectService().ModerateAsync(14, 2, new ModerationDecisionDto("approve", null)));
        await _projects.DidNotReceive().SaveAsync();
    }

    [Fact]
    public async Task Expertise_OwnProject_IsRejected()
    {
        _projects.GetEntityAsync(15).Returns(Project(15, "expertise", authorId: 3));

        await Assert.ThrowsAsync<BusinessRuleException>(() =>
            CreateProjectService().ConcludeAsync(15, 3, new ExpertConclusionDto("technical", "approve", null)));
    }

    [Fact]
    public async Task AutoAssign_PicksLeastLoadedModeratorWhoIsNotTheAuthor()
    {
        var project = Project(14, "submitted", authorId: 12);
        _projects.GetEntityAsync(14).Returns(project);
        _users.GetByRoleAsync("moderator").Returns(new List<LookupItem> { new(2, "Шевчук Андрій"), new(12, "Автор"), new(13, "Лисенко Роман") });
        _projects.GetByStatusesAsync(Arg.Any<IReadOnlyCollection<string>>()).Returns(new List<ProjectListItem>
        {
            new(20, 2, null, "А", null, "moderation", 1, "", 1, "", 0, 0, "", DateTime.Now, null, null, ModeratorId: 2),
            new(21, 2, null, "Б", null, "moderation", 1, "", 1, "", 0, 0, "", DateTime.Now, null, null, ModeratorId: 2),
        });

        var name = await CreateProjectService().AssignModeratorAsync(14, null);

        Assert.Equal("Лисенко Роман", name);
        Assert.Equal(13, project.ModeratorId);
        Assert.Equal("moderation", project.Status);
    }

    [Fact]
    public void Words_AgreeWithNumbers()
    {
        Assert.Equal("1 голос", Words.Votes(1));
        Assert.Equal("3 голоси", Words.Votes(3));
        Assert.Equal("5 голосів", Words.Votes(5));
        Assert.Equal("11 голосів", Words.Votes(11));
        Assert.Equal("22 голоси", Words.Votes(22));
    }
}
