using CivicBudget.DAL.Infrastructure;
using CivicBudget.DAL.Repositories;
using CivicBudget.DAL.Sql;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CivicBudget.DAL;

/// <summary>Реєстрація шару доступу до даних у DI-контейнері застосунку.</summary>
public static class DalServiceCollectionExtensions
{
    public static IServiceCollection AddCivicBudgetDal(this IServiceCollection services, string connectionString)
    {
        services.AddScoped<SessionContextInterceptor>();
        services.AddDbContext<CivicBudgetContext>((sp, options) =>
            options.UseSqlServer(connectionString, sql => sql.UseNetTopologySuite())   // geography (Project.Location) → NetTopologySuite.Point
                   .AddInterceptors(sp.GetRequiredService<SessionContextInterceptor>()));

        services.AddScoped(sp => new SqlConnectionFactory(connectionString, sp.GetRequiredService<ICurrentUser>()));

        // EF Core-репозиторії
        services.AddScoped<IReferenceRepository, ReferenceRepository>();
        services.AddScoped<ICampaignRepository, CampaignRepository>();
        services.AddScoped<IProjectRepository, ProjectRepository>();
        services.AddScoped<IVoteRepository, VoteRepository>();
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<INotificationRepository, NotificationRepository>();
        services.AddScoped<IStatisticsRepository, StatisticsRepository>();
        services.AddScoped<IAttachmentRepository, AttachmentRepository>();
        services.AddScoped<IImplementationRepository, ImplementationRepository>();

        // ADO.NET-репозиторії
        services.AddScoped<IProcedureRepository, ProcedureRepository>();
        services.AddScoped<IFunctionRepository, FunctionRepository>();
        services.AddScoped<IAuditRepository, AuditRepository>();
        return services;
    }
}
