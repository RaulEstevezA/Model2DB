"""Django models written by Model2DB from Invoice. Review them before using them."""

from django.db import models


class Invoice(models.Model):
    invoice_id = models.IntegerField(primary_key=True)
    number = models.TextField()
    issued_at = models.DateTimeField()
    currency = models.TextField()
    paid = models.BooleanField()
    customer = models.ForeignKey("Customer", on_delete=models.PROTECT, related_name="+")
    notes = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "invoices"


class Customer(models.Model):
    customer_id = models.IntegerField(primary_key=True)
    name = models.TextField()
    email = models.TextField()
    billing_address_street = models.TextField()
    billing_address_city = models.TextField()
    billing_address_zip_code = models.TextField()

    class Meta:
        db_table = "customers"


class Line(models.Model):
    id = models.BigAutoField(primary_key=True)
    description = models.TextField()
    qty = models.IntegerField()
    unit_price = models.FloatField()
    tax_rate = models.FloatField()
    invoice = models.ForeignKey("Invoice", on_delete=models.CASCADE, related_name="lines")

    class Meta:
        db_table = "lines"


class InvoiceLabel(models.Model):
    pk = models.CompositePrimaryKey("invoice", "position")
    invoice = models.ForeignKey("Invoice", on_delete=models.CASCADE, related_name="labels")
    position = models.IntegerField()
    value = models.TextField()

    class Meta:
        db_table = "invoice_labels"
