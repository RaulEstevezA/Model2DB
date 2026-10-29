// DbContext written by Model2DB from User, for Npgsql.EntityFrameworkCore.PostgreSQL.
// Create the database with `dotnet ef migrations add InitialCreate` and `dotnet ef database update`.
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;

namespace Example.Data;

public class UserDbContext(DbContextOptions<UserDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Post> Posts => Set<Post>();
    public DbSet<Comment> Comments => Set<Comment>();
    public DbSet<PostTag> PostTags => Set<PostTag>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("users");
            entity.HasKey(e => e.Id).HasName("pk_users");
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("TEXT").IsRequired().ValueGeneratedNever();
            entity.Property(e => e.Email).HasColumnName("email").HasColumnType("TEXT").IsRequired();
            entity.Property(e => e.Name).HasColumnName("name").HasColumnType("TEXT");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasColumnType("TIMESTAMPTZ").IsRequired().HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.Property(e => e.ProfileBio).HasColumnName("profile_bio").HasColumnType("TEXT");
            entity.Property(e => e.ProfileWebsite).HasColumnName("profile_website").HasColumnType("TEXT");
            entity.HasIndex(e => new { e.Email }).IsUnique().HasDatabaseName("uq_users_email");
        });

        modelBuilder.Entity<Post>(entity =>
        {
            entity.ToTable("posts");
            entity.HasKey(e => e.Id).HasName("pk_posts");
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("INTEGER").IsRequired().ValueGeneratedOnAdd();
            entity.Property(e => e.Title).HasColumnName("title").HasColumnType("VARCHAR(200)").IsRequired();
            entity.Property(e => e.Body).HasColumnName("body").HasColumnType("TEXT").IsRequired();
            entity.Property(e => e.Published).HasColumnName("published").HasColumnType("BOOLEAN").IsRequired().HasDefaultValue(false);
            entity.Property(e => e.AuthorId).HasColumnName("author_id").HasColumnType("TEXT").IsRequired();
            entity.HasIndex(e => new { e.AuthorId }).HasDatabaseName("ix_posts_author_id");
            entity.HasOne(e => e.Author).WithMany(p => p.Posts).HasForeignKey(e => e.AuthorId).HasConstraintName("fk_posts_author_id").OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Comment>(entity =>
        {
            entity.ToTable("comments");
            entity.HasKey(e => e.Id).HasName("pk_comments");
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("BIGINT").IsRequired().ValueGeneratedOnAdd();
            entity.Property(e => e.Text).HasColumnName("text").HasColumnType("TEXT").IsRequired();
            entity.Property(e => e.WrittenAt).HasColumnName("written_at").HasColumnType("TIMESTAMPTZ").IsRequired();
            entity.Property(e => e.Rating).HasColumnName("rating").HasColumnType("INTEGER");
            entity.Property(e => e.PostId).HasColumnName("post_id").HasColumnType("INTEGER").IsRequired();
            entity.HasIndex(e => new { e.PostId }).HasDatabaseName("ix_comments_post_id");
            entity.HasOne(e => e.Post).WithMany(p => p.Comments).HasForeignKey(e => e.PostId).HasConstraintName("fk_comments_post_id").OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PostTag>(entity =>
        {
            entity.ToTable("post_tags");
            entity.HasKey(e => new { e.PostId, e.Position }).HasName("pk_post_tags");
            entity.Property(e => e.PostId).HasColumnName("post_id").HasColumnType("INTEGER").IsRequired();
            entity.Property(e => e.Position).HasColumnName("position").HasColumnType("INTEGER").IsRequired();
            entity.Property(e => e.Value).HasColumnName("value").HasColumnType("TEXT").IsRequired();
            entity.HasOne(e => e.Post).WithMany(p => p.Tags).HasForeignKey(e => e.PostId).HasConstraintName("fk_post_tags_post_id").OnDelete(DeleteBehavior.Cascade);
        });
    }
}
