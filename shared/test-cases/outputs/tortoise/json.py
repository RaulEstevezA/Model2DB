"""Tortoise ORM models written by Model2DB from Invoice. Register them as the "models" app.

Create the tables with Aerich (`aerich init-db`) or `Tortoise.generate_schemas()`. Review them before using them.
"""

from tortoise import fields
from tortoise.models import Model


class Invoice(Model):
    invoice_id = fields.IntField(primary_key=True, generated=False)
    number = fields.TextField()
    issued_at = fields.DatetimeField()
    currency = fields.TextField()
    paid = fields.BooleanField()
    customer = fields.ForeignKeyField("models.Customer", related_name=False, on_delete=fields.RESTRICT, db_index=True)
    notes = fields.JSONField(null=True)

    class Meta:
        table = "invoices"


class Customer(Model):
    customer_id = fields.IntField(primary_key=True, generated=False)
    name = fields.TextField()
    email = fields.TextField()
    billing_address_street = fields.TextField()
    billing_address_city = fields.TextField()
    billing_address_zip_code = fields.TextField()

    class Meta:
        table = "customers"


class Line(Model):
    id = fields.BigIntField(primary_key=True)
    description = fields.TextField()
    qty = fields.IntField()
    unit_price = fields.FloatField()
    tax_rate = fields.FloatField()
    invoice = fields.ForeignKeyField("models.Invoice", related_name="lines", on_delete=fields.CASCADE, db_index=True)

    class Meta:
        table = "lines"


class InvoiceLabel(Model):
    invoice = fields.ForeignKeyField("models.Invoice", related_name="labels", on_delete=fields.CASCADE)
    position = fields.IntField()
    value = fields.TextField()

    class Meta:
        table = "invoice_labels"
        unique_together = (("invoice", "position"),)
