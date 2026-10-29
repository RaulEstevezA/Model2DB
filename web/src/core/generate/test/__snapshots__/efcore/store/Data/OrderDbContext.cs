// DbContext written by Model2DB from Order, for Npgsql.EntityFrameworkCore.PostgreSQL.
// Create the database with `dotnet ef migrations add InitialCreate` and `dotnet ef database update`.
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;

namespace Example.Data;

public class OrderDbContext(DbContextOptions<OrderDbContext> options) : DbContext(options)
{
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderLine> OrderLines => Set<OrderLine>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<OrderTag> OrderTags => Set<OrderTag>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Customer>(entity =>
        {
            entity.ToTable("customers");
            entity.HasKey(e => e.Id).HasName("pk_customers");
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("BIGINT").IsRequired().ValueGeneratedNever();
            entity.Property(e => e.Email).HasColumnName("email").HasColumnType("TEXT").IsRequired();
            entity.Property(e => e.FullName).HasColumnName("full_name").HasColumnType("TEXT").IsRequired();
            entity.Property(e => e.Phone).HasColumnName("phone").HasColumnType("TEXT");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasColumnType("TIMESTAMPTZ").IsRequired();
            entity.Property(e => e.ShippingAddressStreet).HasColumnName("shipping_address_street").HasColumnType("TEXT").IsRequired();
            entity.Property(e => e.ShippingAddressCity).HasColumnName("shipping_address_city").HasColumnType("TEXT").IsRequired();
            entity.Property(e => e.ShippingAddressPostalCode).HasColumnName("shipping_address_postal_code").HasColumnType("TEXT").IsRequired();
            entity.Property(e => e.ShippingAddressCountry).HasColumnName("shipping_address_country").HasColumnType("TEXT").IsRequired();
        });

        modelBuilder.Entity<Order>(entity =>
        {
            entity.ToTable("orders", t => { t.HasCheckConstraint("ck_orders_status", "status IN ('draft', 'paid', 'shipped', 'cancelled')"); });
            entity.HasKey(e => e.Id).HasName("pk_orders");
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("BIGINT").IsRequired().ValueGeneratedNever();
            entity.Property(e => e.Status).HasColumnName("status").HasColumnType("VARCHAR(20)").IsRequired().HasConversion(v => OrderStatusValues.ToValue(v), v => OrderStatusValues.FromValue(v));
            entity.Property(e => e.CouponCode).HasColumnName("coupon_code").HasColumnType("TEXT");
            entity.Property(e => e.PlacedAt).HasColumnName("placed_at").HasColumnType("TIMESTAMPTZ").IsRequired();
            entity.Property(e => e.CustomerId).HasColumnName("customer_id").HasColumnType("BIGINT").IsRequired();
            entity.HasIndex(e => new { e.CustomerId }).HasDatabaseName("ix_orders_customer_id");
            entity.HasOne(e => e.Customer).WithMany().HasForeignKey(e => e.CustomerId).HasConstraintName("fk_orders_customer_id").OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<OrderLine>(entity =>
        {
            entity.ToTable("order_lines");
            entity.HasKey(e => e.Id).HasName("pk_order_lines");
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("BIGINT").IsRequired().ValueGeneratedOnAdd();
            entity.Property(e => e.Quantity).HasColumnName("quantity").HasColumnType("DOUBLE PRECISION").IsRequired();
            entity.Property(e => e.UnitPrice).HasColumnName("unit_price").HasColumnType("DOUBLE PRECISION").IsRequired();
            entity.Property(e => e.OrderId).HasColumnName("order_id").HasColumnType("BIGINT").IsRequired();
            entity.Property(e => e.ProductId).HasColumnName("product_id").HasColumnType("BIGINT").IsRequired();
            entity.HasIndex(e => new { e.OrderId }).HasDatabaseName("ix_order_lines_order_id");
            entity.HasIndex(e => new { e.ProductId }).HasDatabaseName("ix_order_lines_product_id");
            entity.HasOne(e => e.Order).WithMany(p => p.Lines).HasForeignKey(e => e.OrderId).HasConstraintName("fk_order_lines_order_id").OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Product).WithMany().HasForeignKey(e => e.ProductId).HasConstraintName("fk_order_lines_product_id").OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Product>(entity =>
        {
            entity.ToTable("products");
            entity.HasKey(e => e.Id).HasName("pk_products");
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("BIGINT").IsRequired().ValueGeneratedNever();
            entity.Property(e => e.Sku).HasColumnName("sku").HasColumnType("TEXT").IsRequired();
            entity.Property(e => e.Name).HasColumnName("name").HasColumnType("TEXT").IsRequired();
            entity.Property(e => e.Price).HasColumnName("price").HasColumnType("DOUBLE PRECISION").IsRequired();
            entity.Property(e => e.Attributes).HasColumnName("attributes").HasColumnType("JSONB").IsRequired();
            entity.HasMany(e => e.Categories).WithMany(p => p.Products).UsingEntity<Dictionary<string, object>>(
                "categories_products",
                r => r.HasOne<Category>().WithMany().HasForeignKey("category_id").HasConstraintName("fk_categories_products_category_id").OnDelete(DeleteBehavior.Cascade),
                l => l.HasOne<Product>().WithMany().HasForeignKey("product_id").HasConstraintName("fk_categories_products_product_id").OnDelete(DeleteBehavior.Cascade),
                j => { j.ToTable("categories_products"); j.HasKey("product_id", "category_id").HasName("pk_categories_products"); });
        });

        modelBuilder.Entity<Category>(entity =>
        {
            entity.ToTable("categories");
            entity.HasKey(e => e.Id).HasName("pk_categories");
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("BIGINT").IsRequired().ValueGeneratedNever();
            entity.Property(e => e.Name).HasColumnName("name").HasColumnType("TEXT").IsRequired();
        });

        modelBuilder.Entity<OrderTag>(entity =>
        {
            entity.ToTable("order_tags");
            entity.HasKey(e => new { e.OrderId, e.Position }).HasName("pk_order_tags");
            entity.Property(e => e.OrderId).HasColumnName("order_id").HasColumnType("BIGINT").IsRequired();
            entity.Property(e => e.Position).HasColumnName("position").HasColumnType("INTEGER").IsRequired();
            entity.Property(e => e.Value).HasColumnName("value").HasColumnType("TEXT").IsRequired();
            entity.HasOne(e => e.Order).WithMany(p => p.Tags).HasForeignKey(e => e.OrderId).HasConstraintName("fk_order_tags_order_id").OnDelete(DeleteBehavior.Cascade);
        });
    }
}
