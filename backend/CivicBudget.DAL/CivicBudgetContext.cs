using System;
using System.Collections.Generic;
using CivicBudget.DAL.Entities;
using Microsoft.EntityFrameworkCore;

namespace CivicBudget.DAL;

public partial class CivicBudgetContext : DbContext
{
    public CivicBudgetContext(DbContextOptions<CivicBudgetContext> options)
        : base(options)
    {
    }

    public virtual DbSet<AppRole> AppRoles { get; set; }

    public virtual DbSet<Attachment> Attachments { get; set; }

    public virtual DbSet<AuditLog> AuditLogs { get; set; }

    public virtual DbSet<BudgetItem> BudgetItems { get; set; }

    public virtual DbSet<Campaign> Campaigns { get; set; }

    public virtual DbSet<CampaignCategory> CampaignCategories { get; set; }

    public virtual DbSet<Category> Categories { get; set; }

    public virtual DbSet<Contractor> Contractors { get; set; }

    public virtual DbSet<District> Districts { get; set; }

    public virtual DbSet<Implementation> Implementations { get; set; }

    public virtual DbSet<ImplementationStage> ImplementationStages { get; set; }

    public virtual DbSet<Notification> Notifications { get; set; }

    public virtual DbSet<PollingStation> PollingStations { get; set; }

    public virtual DbSet<Project> Projects { get; set; }

    public virtual DbSet<Report> Reports { get; set; }

    public virtual DbSet<Review> Reviews { get; set; }

    public virtual DbSet<Subscription> Subscriptions { get; set; }

    public virtual DbSet<UserAccount> UserAccounts { get; set; }

    public virtual DbSet<UserRole> UserRoles { get; set; }

    public virtual DbSet<Vote> Votes { get; set; }

    public virtual DbSet<VwImplementationProgress> VwImplementationProgresses { get; set; }

    public virtual DbSet<VwProjectCost> VwProjectCosts { get; set; }

    public virtual DbSet<VwProjectResult> VwProjectResults { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.UseCollation("Cyrillic_General_CI_AS");

        modelBuilder.Entity<AppRole>(entity =>
        {
            entity.HasKey(e => e.RoleId);

            entity.ToTable("AppRole");

            entity.HasIndex(e => e.Code, "UQ_AppRole_Code").IsUnique();

            entity.Property(e => e.RoleId).ValueGeneratedOnAdd();
            entity.Property(e => e.Code)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.Name).HasMaxLength(50);
        });

        modelBuilder.Entity<Attachment>(entity =>
        {
            entity.ToTable("Attachment");

            entity.HasIndex(e => e.ProjectId, "IX_Attachment_Project").HasFilter("([ProjectId] IS NOT NULL)");

            entity.HasIndex(e => e.ReportId, "IX_Attachment_Report").HasFilter("([ReportId] IS NOT NULL)");

            entity.HasIndex(e => e.StorageKey, "UQ_Attachment_StorageKey").IsUnique();

            entity.Property(e => e.FileName).HasMaxLength(255);
            entity.Property(e => e.MimeType)
                .HasMaxLength(100)
                .IsUnicode(false);
            entity.Property(e => e.StorageKey)
                .HasMaxLength(500)
                .IsUnicode(false);
            entity.Property(e => e.UploadedAt)
                .HasPrecision(0)
                .HasDefaultValueSql("(sysdatetime())");

            entity.HasOne(d => d.Project).WithMany(p => p.Attachments)
                .HasForeignKey(d => d.ProjectId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("FK_Attachment_Project");

            entity.HasOne(d => d.Report).WithMany(p => p.Attachments)
                .HasForeignKey(d => d.ReportId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("FK_Attachment_Report");

            entity.HasOne(d => d.UploadedByNavigation).WithMany(p => p.Attachments)
                .HasForeignKey(d => d.UploadedBy)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Attachment_UploadedBy");
        });

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.HasKey(e => e.AuditId);

            entity.ToTable("AuditLog");

            entity.HasIndex(e => e.CreatedAt, "IX_AuditLog_CreatedAt");

            entity.HasIndex(e => new { e.EntityName, e.EntityId }, "IX_AuditLog_Entity");

            entity.HasIndex(e => new { e.UserId, e.CreatedAt }, "IX_AuditLog_User").HasFilter("([UserId] IS NOT NULL)");

            entity.Property(e => e.ActionCode)
                .HasMaxLength(30)
                .IsUnicode(false);
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.Details).HasMaxLength(1000);
            entity.Property(e => e.EntityName)
                .HasMaxLength(50)
                .IsUnicode(false);
            entity.Property(e => e.IpAddress)
                .HasMaxLength(45)
                .IsUnicode(false);

            entity.HasOne(d => d.User).WithMany(p => p.AuditLogs)
                .HasForeignKey(d => d.UserId)
                .HasConstraintName("FK_AuditLog_User");
        });

        modelBuilder.Entity<BudgetItem>(entity =>
        {
            entity.ToTable("BudgetItem");

            entity.HasIndex(e => e.ProjectId, "IX_BudgetItem_Project");

            entity.Property(e => e.Amount)
                .HasComputedColumnSql("(CONVERT([decimal](14,2),[Quantity]*[UnitPrice]))", true)
                .HasColumnType("decimal(14, 2)");
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Quantity).HasColumnType("decimal(10, 2)");
            entity.Property(e => e.Unit).HasMaxLength(20);
            entity.Property(e => e.UnitPrice).HasColumnType("decimal(12, 2)");

            entity.HasOne(d => d.Project).WithMany(p => p.BudgetItems)
                .HasForeignKey(d => d.ProjectId)
                .HasConstraintName("FK_BudgetItem_Project");
        });

        modelBuilder.Entity<Campaign>(entity =>
        {
            entity.ToTable("Campaign");

            entity.HasIndex(e => e.CampaignYear, "UQ_Campaign_Year").IsUnique();

            entity.Property(e => e.MaxProjectCost).HasColumnType("decimal(12, 2)");
            entity.Property(e => e.MaxProjectsPerAuthor).HasDefaultValue((byte)5);
            entity.Property(e => e.MaxVotesPerProject).HasDefaultValue((byte)2);
            entity.Property(e => e.MinProjectCost)
                .HasDefaultValue(50000m)
                .HasColumnType("decimal(12, 2)");
            entity.Property(e => e.MinVoterAge).HasDefaultValue((byte)16);
            entity.Property(e => e.Name).HasMaxLength(150);
            entity.Property(e => e.Status)
                .HasMaxLength(15)
                .IsUnicode(false)
                .HasDefaultValue("draft");
            entity.Property(e => e.TotalBudget).HasColumnType("decimal(14, 2)");
            entity.Property(e => e.VotesPerVoter).HasDefaultValue((byte)5);

            entity.HasOne(d => d.CreatedByNavigation).WithMany(p => p.Campaigns)
                .HasForeignKey(d => d.CreatedBy)
                .HasConstraintName("FK_Campaign_CreatedBy");
        });

        modelBuilder.Entity<CampaignCategory>(entity =>
        {
            entity.HasKey(e => new { e.CampaignId, e.CategoryId });

            entity.ToTable("CampaignCategory");

            entity.Property(e => e.BudgetLimit).HasColumnType("decimal(14, 2)");

            entity.HasOne(d => d.Campaign).WithMany(p => p.CampaignCategories)
                .HasForeignKey(d => d.CampaignId)
                .HasConstraintName("FK_CampaignCategory_Campaign");

            entity.HasOne(d => d.Category).WithMany(p => p.CampaignCategories)
                .HasForeignKey(d => d.CategoryId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_CampaignCategory_Category");
        });

        modelBuilder.Entity<Category>(entity =>
        {
            entity.ToTable("Category");

            entity.HasIndex(e => e.Name, "UQ_Category_Name").IsUnique();

            entity.Property(e => e.CategoryId).ValueGeneratedOnAdd();
            entity.Property(e => e.Description).HasMaxLength(300);
            entity.Property(e => e.Name).HasMaxLength(60);
        });

        modelBuilder.Entity<Contractor>(entity =>
        {
            entity.ToTable("Contractor");

            entity.HasIndex(e => e.Edrpou, "UQ_Contractor_Edrpou").IsUnique();

            entity.Property(e => e.Edrpou)
                .HasMaxLength(8)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.Email)
                .HasMaxLength(254)
                .IsUnicode(false);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Phone)
                .HasMaxLength(20)
                .IsUnicode(false);
        });

        modelBuilder.Entity<District>(entity =>
        {
            entity.ToTable("District");

            entity.HasIndex(e => e.Name, "UQ_District_Name").IsUnique();

            entity.Property(e => e.DistrictId).ValueGeneratedOnAdd();
            entity.Property(e => e.Name).HasMaxLength(60);
        });

        modelBuilder.Entity<Implementation>(entity =>
        {
            entity.ToTable("Implementation");

            entity.HasIndex(e => e.ContractorId, "IX_Implementation_Contractor");

            entity.HasIndex(e => e.ProjectId, "UQ_Implementation_Project").IsUnique();

            entity.Property(e => e.CreatedAt)
                .HasPrecision(0)
                .HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.PlannedBudget).HasColumnType("decimal(14, 2)");
            entity.Property(e => e.Status)
                .HasMaxLength(12)
                .IsUnicode(false)
                .HasDefaultValue("planned");

            entity.HasOne(d => d.Contractor).WithMany(p => p.Implementations)
                .HasForeignKey(d => d.ContractorId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Implementation_Contractor");

            entity.HasOne(d => d.CreatedByNavigation).WithMany(p => p.Implementations)
                .HasForeignKey(d => d.CreatedBy)
                .HasConstraintName("FK_Implementation_CreatedBy");

            entity.HasOne(d => d.Project).WithOne(p => p.Implementation)
                .HasForeignKey<Implementation>(d => d.ProjectId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Implementation_Project");
        });

        modelBuilder.Entity<ImplementationStage>(entity =>
        {
            entity.HasKey(e => e.StageId);

            entity.ToTable("ImplementationStage");

            entity.HasIndex(e => new { e.ImplementationId, e.StageNo }, "UQ_ImplementationStage_No").IsUnique();

            entity.Property(e => e.ActualCost).HasColumnType("decimal(14, 2)");
            entity.Property(e => e.Name).HasMaxLength(150);
            entity.Property(e => e.PlannedCost).HasColumnType("decimal(14, 2)");
            entity.Property(e => e.Status)
                .HasMaxLength(12)
                .IsUnicode(false)
                .HasDefaultValue("planned");

            entity.HasOne(d => d.Implementation).WithMany(p => p.ImplementationStages)
                .HasForeignKey(d => d.ImplementationId)
                .HasConstraintName("FK_ImplementationStage_Impl");
        });

        modelBuilder.Entity<Notification>(entity =>
        {
            entity.ToTable("Notification");

            entity.HasIndex(e => e.CreatedAt, "IX_Notification_Unsent").HasFilter("([SentAt] IS NULL)");

            entity.HasIndex(e => new { e.UserId, e.IsRead, e.CreatedAt }, "IX_Notification_User").IsDescending(false, false, true);

            entity.Property(e => e.Body).HasMaxLength(1000);
            entity.Property(e => e.Channel)
                .HasMaxLength(6)
                .IsUnicode(false)
                .HasDefaultValue("email");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(0)
                .HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.NotifType)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.SentAt).HasPrecision(0);

            entity.HasOne(d => d.Project).WithMany(p => p.Notifications)
                .HasForeignKey(d => d.ProjectId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("FK_Notification_Project");

            entity.HasOne(d => d.User).WithMany(p => p.Notifications)
                .HasForeignKey(d => d.UserId)
                .HasConstraintName("FK_Notification_User");
        });

        modelBuilder.Entity<PollingStation>(entity =>
        {
            entity.HasKey(e => e.StationId);

            entity.ToTable("PollingStation");

            entity.Property(e => e.Address).HasMaxLength(200);
            entity.Property(e => e.IsActive).HasDefaultValue(true);
            entity.Property(e => e.Name).HasMaxLength(100);

            entity.HasOne(d => d.District).WithMany(p => p.PollingStations)
                .HasForeignKey(d => d.DistrictId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PollingStation_District");
        });

        modelBuilder.Entity<Project>(entity =>
        {
            entity.ToTable("Project", tb => tb.HasTrigger("TR_Project_StatusChange"));

            entity.HasIndex(e => e.AuthorId, "IX_Project_Author");

            entity.HasIndex(e => new { e.CampaignId, e.Status }, "IX_Project_Campaign_Status");

            entity.HasIndex(e => e.ModeratorId, "IX_Project_Moderator").HasFilter("([ModeratorId] IS NOT NULL)");

            entity.HasIndex(e => e.Location, "SIX_Project_Location");

            entity.HasIndex(e => e.RegNumber, "UX_Project_RegNumber")
                .IsUnique()
                .HasFilter("([RegNumber] IS NOT NULL)");

            entity.Property(e => e.Address).HasMaxLength(200);
            entity.Property(e => e.CreatedAt)
                .HasPrecision(0)
                .HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.PublishedAt).HasPrecision(0);
            entity.Property(e => e.RegNumber)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.Status)
                .HasMaxLength(15)
                .IsUnicode(false)
                .HasDefaultValue("draft");
            entity.Property(e => e.SubmittedAt).HasPrecision(0);
            entity.Property(e => e.Summary).HasMaxLength(500);
            entity.Property(e => e.Title).HasMaxLength(200);
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(0)
                .HasDefaultValueSql("(sysdatetime())");

            entity.HasOne(d => d.Author).WithMany(p => p.ProjectAuthors)
                .HasForeignKey(d => d.AuthorId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Project_Author");

            entity.HasOne(d => d.District).WithMany(p => p.Projects)
                .HasForeignKey(d => d.DistrictId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Project_District");

            entity.HasOne(d => d.DuplicateOf).WithMany(p => p.InverseDuplicateOf)
                .HasForeignKey(d => d.DuplicateOfId)
                .HasConstraintName("FK_Project_DuplicateOf");

            entity.HasOne(d => d.Moderator).WithMany(p => p.ProjectModerators)
                .HasForeignKey(d => d.ModeratorId)
                .HasConstraintName("FK_Project_Moderator");

            entity.HasOne(d => d.CampaignCategory).WithMany(p => p.Projects)
                .HasForeignKey(d => new { d.CampaignId, d.CategoryId })
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Project_CampaignCategory");
        });

        modelBuilder.Entity<Report>(entity =>
        {
            entity.ToTable("Report");

            entity.HasIndex(e => e.StageId, "IX_Report_Stage");

            entity.Property(e => e.ReviewComment).HasMaxLength(1000);
            entity.Property(e => e.ReviewedAt).HasPrecision(0);
            entity.Property(e => e.Status)
                .HasMaxLength(10)
                .IsUnicode(false)
                .HasDefaultValue("submitted");
            entity.Property(e => e.SubmittedAt)
                .HasPrecision(0)
                .HasDefaultValueSql("(sysdatetime())");

            entity.HasOne(d => d.Author).WithMany(p => p.ReportAuthors)
                .HasForeignKey(d => d.AuthorId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Report_Author");

            entity.HasOne(d => d.ReviewedByNavigation).WithMany(p => p.ReportReviewedByNavigations)
                .HasForeignKey(d => d.ReviewedBy)
                .HasConstraintName("FK_Report_ReviewedBy");

            entity.HasOne(d => d.Stage).WithMany(p => p.Reports)
                .HasForeignKey(d => d.StageId)
                .HasConstraintName("FK_Report_Stage");
        });

        modelBuilder.Entity<Review>(entity =>
        {
            entity.ToTable("Review");

            entity.HasIndex(e => new { e.ProjectId, e.CreatedAt }, "IX_Review_Project");

            entity.HasIndex(e => e.ReviewerId, "IX_Review_Reviewer");

            entity.Property(e => e.Comment).HasMaxLength(2000);
            entity.Property(e => e.CreatedAt)
                .HasPrecision(0)
                .HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.Decision)
                .HasMaxLength(8)
                .IsUnicode(false);
            entity.Property(e => e.ReviewType)
                .HasMaxLength(12)
                .IsUnicode(false);

            entity.HasOne(d => d.Project).WithMany(p => p.Reviews)
                .HasForeignKey(d => d.ProjectId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Review_Project");

            entity.HasOne(d => d.Reviewer).WithMany(p => p.Reviews)
                .HasForeignKey(d => d.ReviewerId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Review_Reviewer");
        });

        modelBuilder.Entity<Subscription>(entity =>
        {
            entity.HasKey(e => new { e.UserId, e.ProjectId });

            entity.ToTable("Subscription");

            entity.HasIndex(e => e.ProjectId, "IX_Subscription_Project");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(0)
                .HasDefaultValueSql("(sysdatetime())");

            entity.HasOne(d => d.Project).WithMany(p => p.Subscriptions)
                .HasForeignKey(d => d.ProjectId)
                .HasConstraintName("FK_Subscription_Project");

            entity.HasOne(d => d.User).WithMany(p => p.Subscriptions)
                .HasForeignKey(d => d.UserId)
                .HasConstraintName("FK_Subscription_User");
        });

        modelBuilder.Entity<UserAccount>(entity =>
        {
            entity.HasKey(e => e.UserId);

            entity.ToTable("UserAccount");

            entity.HasIndex(e => new { e.LastName, e.FirstName }, "IX_UserAccount_LastName");

            entity.HasIndex(e => e.Email, "UX_UserAccount_Email")
                .IsUnique()
                .HasFilter("([Email] IS NOT NULL)");

            entity.HasIndex(e => e.IdentityHash, "UX_UserAccount_IdentityHash")
                .IsUnique()
                .HasFilter("([IdentityHash] IS NOT NULL)");

            entity.Property(e => e.Email)
                .HasMaxLength(254)
                .IsUnicode(false);
            entity.Property(e => e.FirstName).HasMaxLength(50);
            entity.Property(e => e.IdentityHash)
                .HasMaxLength(64)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.LastName).HasMaxLength(50);
            entity.Property(e => e.MiddleName).HasMaxLength(50);
            entity.Property(e => e.PasswordHash)
                .HasMaxLength(60)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.Phone)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.RegAddress).HasMaxLength(200);
            entity.Property(e => e.RegisteredAt)
                .HasPrecision(0)
                .HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.VerificationMethod)
                .HasMaxLength(10)
                .IsUnicode(false);
            entity.Property(e => e.VerificationStatus)
                .HasMaxLength(10)
                .IsUnicode(false)
                .HasDefaultValue("pending");
            entity.Property(e => e.VerifiedAt).HasPrecision(0);

            entity.HasOne(d => d.Contractor).WithMany(p => p.UserAccounts)
                .HasForeignKey(d => d.ContractorId)
                .HasConstraintName("FK_UserAccount_Contractor");

            entity.HasOne(d => d.District).WithMany(p => p.UserAccounts)
                .HasForeignKey(d => d.DistrictId)
                .HasConstraintName("FK_UserAccount_District");
        });

        modelBuilder.Entity<UserRole>(entity =>
        {
            entity.HasKey(e => new { e.UserId, e.RoleId });

            entity.ToTable("UserRole");

            entity.Property(e => e.AssignedAt)
                .HasPrecision(0)
                .HasDefaultValueSql("(sysdatetime())");

            entity.HasOne(d => d.AssignedByNavigation).WithMany(p => p.UserRoleAssignedByNavigations)
                .HasForeignKey(d => d.AssignedBy)
                .HasConstraintName("FK_UserRole_AssignedBy");

            entity.HasOne(d => d.Role).WithMany(p => p.UserRoles)
                .HasForeignKey(d => d.RoleId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_UserRole_Role");

            entity.HasOne(d => d.User).WithMany(p => p.UserRoleUsers)
                .HasForeignKey(d => d.UserId)
                .HasConstraintName("FK_UserRole_User");
        });

        modelBuilder.Entity<Vote>(entity =>
        {
            entity.ToTable("Vote", tb => tb.HasTrigger("TR_Vote_CheckRules"));

            entity.HasIndex(e => e.ProjectId, "IX_Vote_Project");

            entity.HasIndex(e => new { e.VoterId, e.ProjectId }, "UQ_Vote_Voter_Project").IsUnique();

            entity.Property(e => e.CastAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.Channel)
                .HasMaxLength(6)
                .IsUnicode(false);
            entity.Property(e => e.VoteCount).HasDefaultValue((byte)1);

            entity.HasOne(d => d.Operator).WithMany(p => p.VoteOperators)
                .HasForeignKey(d => d.OperatorId)
                .HasConstraintName("FK_Vote_Operator");

            entity.HasOne(d => d.Project).WithMany(p => p.Votes)
                .HasForeignKey(d => d.ProjectId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Vote_Project");

            entity.HasOne(d => d.Station).WithMany(p => p.Votes)
                .HasForeignKey(d => d.StationId)
                .HasConstraintName("FK_Vote_Station");

            entity.HasOne(d => d.Voter).WithMany(p => p.VoteVoters)
                .HasForeignKey(d => d.VoterId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Vote_Voter");
        });

        modelBuilder.Entity<VwImplementationProgress>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("vw_ImplementationProgress");

            entity.Property(e => e.ActualCost).HasColumnType("decimal(38, 2)");
            entity.Property(e => e.PlannedBudget).HasColumnType("decimal(14, 2)");
            entity.Property(e => e.Status)
                .HasMaxLength(12)
                .IsUnicode(false);
        });

        modelBuilder.Entity<VwProjectCost>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("vw_ProjectCost");

            entity.Property(e => e.EstimatedCost).HasColumnType("decimal(38, 2)");
        });

        modelBuilder.Entity<VwProjectResult>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("vw_ProjectResult");

            entity.Property(e => e.EstimatedCost).HasColumnType("decimal(38, 2)");
            entity.Property(e => e.RegNumber)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.Status)
                .HasMaxLength(15)
                .IsUnicode(false);
            entity.Property(e => e.Title).HasMaxLength(200);
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
