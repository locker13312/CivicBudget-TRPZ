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

    private ProjectService CreateProjectService()
    {
        var env = Substitute.For<IWebHostEnvironment>();
        env.ContentRootPath.Returns(Path.Combine(Path.GetTempPath(), "civicbudget-tests"));
        var files = new FileStorage(new ConfigurationBuilder().Build(), env);
        return new ProjectService(_projects, _campaigns, _procedures, Substitute.For<IAttachmentRepository>(), _users, files);
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
        var service = new VotingService(_campaigns, _projects, _votes, Hub());

        var ex = await Assert.ThrowsAsync<BusinessRuleException>(() => service.CastAsync(9, 8));

        Assert.Equal(50005, ex.Code);
        await _votes.DidNotReceive().SaveAsync();
    }

    [Fact]
    public async Task SecondOnlineVote_IncrementsExistingRow()
    {
        var vote = new Vote { VoterId = 7, ProjectId = 8, VoteCount = 1, Channel = "online" };
        _votes.GetAsync(7, 8).Returns(vote);
        var service = new VotingService(_campaigns, _projects, _votes, Hub());

        await service.CastAsync(7, 8);

        Assert.Equal(2, vote.VoteCount);
        await _votes.Received(1).SaveAsync();
    }

    [Fact]
    public async Task FirstOnlineVote_AddsNewRow()
    {
        _votes.GetAsync(7, 8).Returns((Vote?)null);
        var service = new VotingService(_campaigns, _projects, _votes, Hub());

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
        var service = new CampaignService(_campaigns, _projects, _procedures, Substitute.For<IStatisticsRepository>(),
            Substitute.For<IAuditRepository>(), Hub());
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

        await Assert.ThrowsAsync<BusinessRuleException>(() => service.UpdateAsync(2, dto, adminId: 1));
        await _campaigns.DidNotReceive().SaveAsync();
    }

    [Fact]
    public async Task SelectWinners_EnrichesProcedureRatingWithTitlesAndLimits()
    {
        _procedures.SelectWinnersAsync(2).Returns(new List<WinnerRow>
        {
            new(5, 1, 7, 17, 350000, true),
            new(5, 2, 8, 15, 300000, false),
            new(5, 3, 9, 7, 120000, true),
        });
        _campaigns.GetModelAsync(2).Returns(new CampaignModel(2, 2026, "ГБ 2026", 6_000_000, 50_000, 1_500_000, 5, 2, 5, 16,
            default, default, default, default, default, default, false, "implementation",
            new[] { new CampaignCategoryModel(5, "Спорт", 600000) }));
        _projects.GetResultsAsync(2).Returns(new List<ResultRow>
        {
            new(8, "GB-2026-0002", "Скейт-парк", "not_selected", 5, "Спорт", "Оболонський", 300000, 15, 14, 1, 15),
        });
        var service = new CampaignService(_campaigns, _projects, _procedures, Substitute.For<IStatisticsRepository>(),
            Substitute.For<IAuditRepository>(), Hub());

        var rating = await service.SelectWinnersAsync(2);

        Assert.Equal(3, rating.Count);
        var skate = rating.Single(r => r.ProjectId == 8);
        Assert.Equal("Скейт-парк", skate.Title);
        Assert.Equal("Спорт", skate.CategoryName);
        Assert.Equal(600000, skate.CategoryLimit);
        Assert.False(skate.IsWinner);
    }
}
