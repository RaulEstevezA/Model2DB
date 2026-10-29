"""MongoEngine documents written by Model2DB from Invoice. Review them before using them."""

import mongoengine as me


class Customer(me.EmbeddedDocument):
    customer_id = me.IntField(required=True)
    name = me.StringField(required=True)
    email = me.StringField(required=True)
    billing_address = me.EmbeddedDocumentField("BillingAddress", required=True)


class BillingAddress(me.EmbeddedDocument):
    street = me.StringField(required=True)
    city = me.StringField(required=True)
    zip_code = me.StringField(required=True)


class Line(me.EmbeddedDocument):
    description = me.StringField(required=True)
    qty = me.IntField(required=True)
    unit_price = me.FloatField(required=True)
    tax_rate = me.FloatField(required=True)


class Invoice(me.Document):
    invoice_id = me.IntField(primary_key=True)
    number = me.StringField(required=True)
    issued_at = me.DateTimeField(required=True)
    currency = me.StringField(required=True)
    paid = me.BooleanField(required=True)
    customer = me.EmbeddedDocumentField("Customer", required=True)
    lines = me.ListField(me.EmbeddedDocumentField("Line"))
    notes = me.DynamicField()
    labels = me.ListField(me.StringField())

    meta = {"collection": "invoices"}
