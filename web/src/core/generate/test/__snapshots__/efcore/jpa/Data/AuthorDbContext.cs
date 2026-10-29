// DbContext written by Model2DB from Author, for Npgsql.EntityFrameworkCore.PostgreSQL.
// Create the database with `dotnet ef migrations add InitialCreate` and `dotnet ef database update`.
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;

namespace Example.Data;

public class AuthorDbContext(DbContextOptions<AuthorDbContext> options) : DbContext(options)
{
    public DbSet<Author> Authors => Set<Author>();
    public DbSet<Book> Books => Set<Book>();
    public DbSet<Tag> Tags => Set<Tag>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Author>(entity =>
        {
            entity.ToTable("authors");
            entity.HasKey(e => e.Id).HasName("pk_authors");
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("BIGINT").IsRequired().ValueGeneratedOnAdd();
            entity.Property(e => e.Name).HasColumnName("name").HasColumnType("VARCHAR(120)").IsRequired();
            entity.Property(e => e.Email).HasColumnName("email").HasColumnType("TEXT").IsRequired();
            entity.HasIndex(e => new { e.Email }).IsUnique().HasDatabaseName("uq_authors_email");
        });

        modelBuilder.Entity<Book>(entity =>
        {
            entity.ToTable("books", t => { t.HasCheckConstraint("ck_books_genre", "genre IN ('FICTION', 'ESSAY', 'POETRY', 'SCIENCE')"); });
            entity.HasKey(e => e.Id).HasName("pk_books");
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("BIGINT").IsRequired().ValueGeneratedOnAdd();
            entity.Property(e => e.Isbn).HasColumnName("isbn").HasColumnType("VARCHAR(13)").IsRequired();
            entity.Property(e => e.Title).HasColumnName("title").HasColumnType("TEXT").IsRequired();
            entity.Property(e => e.Price).HasColumnName("price").HasColumnType("NUMERIC(8, 2)").IsRequired();
            entity.Property(e => e.PublishedOn).HasColumnName("published_on").HasColumnType("DATE").IsRequired();
            entity.Property(e => e.Genre).HasColumnName("genre").HasColumnType("VARCHAR(20)").IsRequired().HasConversion(v => GenreValues.ToValue(v), v => GenreValues.FromValue(v));
            entity.Property(e => e.AuthorId).HasColumnName("author_id").HasColumnType("BIGINT").IsRequired();
            entity.Property(e => e.ShelfRoom).HasColumnName("shelf_room").HasColumnType("TEXT").IsRequired();
            entity.Property(e => e.ShelfRow).HasColumnName("shelf_row").HasColumnType("INTEGER");
            entity.HasIndex(e => new { e.Isbn }).IsUnique().HasDatabaseName("uq_books_isbn");
            entity.HasIndex(e => new { e.AuthorId }).HasDatabaseName("ix_books_author_id");
            entity.HasOne(e => e.Author).WithMany(p => p.Books).HasForeignKey(e => e.AuthorId).HasConstraintName("fk_books_author_id").OnDelete(DeleteBehavior.Restrict);
            entity.HasMany(e => e.Tags).WithMany().UsingEntity<Dictionary<string, object>>(
                "books_tags",
                r => r.HasOne<Tag>().WithMany().HasForeignKey("tag_code").HasConstraintName("fk_books_tags_tag_code").OnDelete(DeleteBehavior.Cascade),
                l => l.HasOne<Book>().WithMany().HasForeignKey("book_id").HasConstraintName("fk_books_tags_book_id").OnDelete(DeleteBehavior.Cascade),
                j => { j.ToTable("books_tags"); j.HasKey("book_id", "tag_code").HasName("pk_books_tags"); });
        });

        modelBuilder.Entity<Tag>(entity =>
        {
            entity.ToTable("tags");
            entity.HasKey(e => e.Code).HasName("pk_tags");
            entity.Property(e => e.Code).HasColumnName("code").HasColumnType("TEXT").IsRequired().ValueGeneratedNever();
            entity.Property(e => e.Label).HasColumnName("label").HasColumnType("TEXT").IsRequired();
        });
    }
}
