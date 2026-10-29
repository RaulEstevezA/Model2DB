// DbContext written by Model2DB from Invoice, for Npgsql.EntityFrameworkCore.PostgreSQL.
// Create the database with `dotnet ef migrations add InitialCreate` and `dotnet ef database update`.
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;

namespace Example.Data;

public class InvoiceDbContext(DbContextOptions<InvoiceDbContext> options) : DbContext(options)
{
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Line> Lines => Set<Line>();
    public DbSet<InvoiceLabel> InvoiceLabels => Set<InvoiceLabel>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Invoice>(entity =>
        {
            entity.ToTable("invoices");
            entity.HasKey(e => e.InvoiceId).HasName("pk_invoices");
            entity.Property(e => e.InvoiceId).HasColumnName("invoice_id").HasColumnType("INTEGER").IsRequired().ValueGeneratedNever();
            entity.Property(e => e.Number).HasColumnName("number").HasColumnType("TEXT").IsRequired();
            entity.Property(e => e.IssuedAt).HasColumnName("issued_at").HasColumnType("TIMESTAMPTZ").IsRequired();
            entity.Property(e => e.Currency).HasColumnName("currency").HasColumnType("TEXT").IsRequired();
            entity.Property(e => e.Paid).HasColumnName("paid").HasColumnType("BOOLEAN").IsRequired();
            entity.Property(e => e.CustomerId).HasColumnName("customer_id").HasColumnType("INTEGER").IsRequired();
            entity.Property(e => e.Notes).HasColumnName("notes").HasColumnType("JSONB");
            entity.HasIndex(e => new { e.CustomerId }).HasDatabaseName("ix_invoices_customer_id");
            entity.HasOne(e => e.Customer).WithMany().HasForeignKey(e => e.CustomerId).HasConstraintName("fk_invoices_customer_id").OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Customer>(entity =>
        {
            entity.ToTable("customers");
            entity.HasKey(e => e.CustomerId).HasName("pk_customers");
            entity.Property(e => e.CustomerId).HasColumnName("customer_id").HasColumnType("INTEGER").IsRequired().ValueGeneratedNever();
            entity.Property(e => e.Name).HasColumnName("name").HasColumnType("TEXT").IsRequired();
            entity.Property(e => e.Email).HasColumnName("email").HasColumnType("TEXT").IsRequired();
            entity.Property(e => e.BillingAddressStreet).HasColumnName("billing_address_street").HasColumnType("TEXT").IsRequired();
            entity.Property(e => e.BillingAddressCity).HasColumnName("billing_address_city").HasColumnType("TEXT").IsRequired();
            entity.Property(e => e.BillingAddressZipCode).HasColumnName("billing_address_zip_code").HasColumnType("TEXT").IsRequired();
        });

        modelBuilder.Entity<Line>(entity =>
        {
            entity.ToTable("lines");
            entity.HasKey(e => e.Id).HasName("pk_lines");
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("BIGINT").IsRequired().ValueGeneratedOnAdd();
            entity.Property(e => e.Description).HasColumnName("description").HasColumnType("TEXT").IsRequired();
            entity.Property(e => e.Qty).HasColumnName("qty").HasColumnType("INTEGER").IsRequired();
            entity.Property(e => e.UnitPrice).HasColumnName("unit_price").HasColumnType("DOUBLE PRECISION").IsRequired();
            entity.Property(e => e.TaxRate).HasColumnName("tax_rate").HasColumnType("DOUBLE PRECISION").IsRequired();
            entity.Property(e => e.InvoiceId).HasColumnName("invoice_id").HasColumnType("INTEGER").IsRequired();
            entity.HasIndex(e => new { e.InvoiceId }).HasDatabaseName("ix_lines_invoice_id");
            entity.HasOne(e => e.Invoice).WithMany(p => p.Lines).HasForeignKey(e => e.InvoiceId).HasConstraintName("fk_lines_invoice_id").OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<InvoiceLabel>(entity =>
        {
            entity.ToTable("invoice_labels");
            entity.HasKey(e => new { e.InvoiceId, e.Position }).HasName("pk_invoice_labels");
            entity.Property(e => e.InvoiceId).HasColumnName("invoice_id").HasColumnType("INTEGER").IsRequired();
            entity.Property(e => e.Position).HasColumnName("position").HasColumnType("INTEGER").IsRequired();
            entity.Property(e => e.Value).HasColumnName("value").HasColumnType("TEXT").IsRequired();
            entity.HasOne(e => e.Invoice).WithMany(p => p.Labels).HasForeignKey(e => e.InvoiceId).HasConstraintName("fk_invoice_labels_invoice_id").OnDelete(DeleteBehavior.Cascade);
        });
    }
}
