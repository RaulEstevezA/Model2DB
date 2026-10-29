"""MongoEngine documents written by Model2DB from Order. Review them before using them."""

import enum

import mongoengine as me


class OrderStatus(str, enum.Enum):
    DRAFT = "draft"
    PAID = "paid"
    SHIPPED = "shipped"
    CANCELLED = "cancelled"


class Customer(me.EmbeddedDocument):
    id = me.FloatField(required=True)
    email = me.StringField(required=True)
    fullName = me.StringField(required=True, db_field="full_name")
    phone = me.StringField()
    shippingAddress = me.EmbeddedDocumentField("Address", required=True, db_field="shipping_address")
    createdAt = me.DateTimeField(required=True, db_field="created_at")


class Address(me.EmbeddedDocument):
    street = me.StringField(required=True)
    city = me.StringField(required=True)
    postalCode = me.StringField(required=True, db_field="postal_code")
    country = me.StringField(required=True)


class OrderLine(me.EmbeddedDocument):
    quantity = me.FloatField(required=True)
    unitPrice = me.FloatField(required=True, db_field="unit_price")


# TODO: decide how "Order.lines.product" is stored (pending in the design).
class Order(me.Document):
    id = me.FloatField(primary_key=True)
    customer = me.EmbeddedDocumentField("Customer", required=True)
    status = me.EnumField(OrderStatus, required=True)
    lines = me.ListField(me.EmbeddedDocumentField("OrderLine"))
    couponCode = me.StringField(db_field="coupon_code")
    tags = me.ListField(me.StringField())
    placedAt = me.DateTimeField(required=True, db_field="placed_at")

    meta = {"collection": "orders"}


class Product(me.Document):
    id = me.FloatField(primary_key=True)
    sku = me.StringField(required=True)
    name = me.StringField(required=True)
    price = me.FloatField(required=True)
    categories = me.ListField(me.ReferenceField("Category"))
    attributes = me.DictField(me.StringField(), required=True)

    meta = {"collection": "products"}


class Category(me.Document):
    id = me.FloatField(primary_key=True)
    name = me.StringField(required=True)
    products = me.ListField(me.ReferenceField("Product"))

    meta = {"collection": "categories"}
