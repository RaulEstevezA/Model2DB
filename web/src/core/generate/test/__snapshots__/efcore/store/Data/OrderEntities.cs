// Entities written by Model2DB from Order. Review them before using them.
using System;
using System.Collections.Generic;

namespace Example.Data;

public enum OrderStatus
{
    Draft,
    Paid,
    Shipped,
    Cancelled,
}

/// <summary>The values of <see cref="OrderStatus"/> as the database stores them.</summary>
public static class OrderStatusValues
{
    public static string ToValue(OrderStatus value) => value switch
    {
        OrderStatus.Draft => "draft",
        OrderStatus.Paid => "paid",
        OrderStatus.Shipped => "shipped",
        OrderStatus.Cancelled => "cancelled",
        _ => throw new ArgumentOutOfRangeException(nameof(value)),
    };

    public static OrderStatus FromValue(string value) => value switch
    {
        "draft" => OrderStatus.Draft,
        "paid" => OrderStatus.Paid,
        "shipped" => OrderStatus.Shipped,
        "cancelled" => OrderStatus.Cancelled,
        _ => throw new ArgumentOutOfRangeException(nameof(value)),
    };
}

public class Customer
{
    public long Id { get; set; }
    public string Email { get; set; } = null!;
    public string FullName { get; set; } = null!;
    public string? Phone { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public string ShippingAddressStreet { get; set; } = null!;
    public string ShippingAddressCity { get; set; } = null!;
    public string ShippingAddressPostalCode { get; set; } = null!;
    public string ShippingAddressCountry { get; set; } = null!;
}

public class Order
{
    public long Id { get; set; }
    public OrderStatus Status { get; set; }
    public string? CouponCode { get; set; }
    public DateTimeOffset PlacedAt { get; set; }
    public long CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;
    public List<OrderLine> Lines { get; set; } = new();
    public List<OrderTag> Tags { get; set; } = new();
}

public class OrderLine
{
    public long Id { get; set; }
    public double Quantity { get; set; }
    public double UnitPrice { get; set; }
    public long OrderId { get; set; }
    public long ProductId { get; set; }
    public Order Order { get; set; } = null!;
    public Product Product { get; set; } = null!;
}

public class Product
{
    public long Id { get; set; }
    public string Sku { get; set; } = null!;
    public string Name { get; set; } = null!;
    public double Price { get; set; }
    public string Attributes { get; set; } = null!;
    public List<Category> Categories { get; set; } = new();
}

public class Category
{
    public long Id { get; set; }
    public string Name { get; set; } = null!;
    public List<Product> Products { get; set; } = new();
}

public class OrderTag
{
    public long OrderId { get; set; }
    public int Position { get; set; }
    public string Value { get; set; } = null!;
    public Order Order { get; set; } = null!;
}
