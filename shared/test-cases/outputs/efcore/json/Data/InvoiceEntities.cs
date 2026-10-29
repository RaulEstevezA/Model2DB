// Entities written by Model2DB from Invoice. Review them before using them.
using System;
using System.Collections.Generic;

namespace Example.Data;

public class Invoice
{
    public int InvoiceId { get; set; }
    public string Number { get; set; } = null!;
    public DateTimeOffset IssuedAt { get; set; }
    public string Currency { get; set; } = null!;
    public bool Paid { get; set; }
    public int CustomerId { get; set; }
    public string? Notes { get; set; }
    public Customer Customer { get; set; } = null!;
    public List<Line> Lines { get; set; } = new();
    public List<InvoiceLabel> Labels { get; set; } = new();
}

public class Customer
{
    public int CustomerId { get; set; }
    public string Name { get; set; } = null!;
    public string Email { get; set; } = null!;
    public string BillingAddressStreet { get; set; } = null!;
    public string BillingAddressCity { get; set; } = null!;
    public string BillingAddressZipCode { get; set; } = null!;
}

public class Line
{
    public long Id { get; set; }
    public string Description { get; set; } = null!;
    public int Qty { get; set; }
    public double UnitPrice { get; set; }
    public double TaxRate { get; set; }
    public int InvoiceId { get; set; }
    public Invoice Invoice { get; set; } = null!;
}

public class InvoiceLabel
{
    public int InvoiceId { get; set; }
    public int Position { get; set; }
    public string Value { get; set; } = null!;
    public Invoice Invoice { get; set; } = null!;
}
