"""Tortoise ORM models written by Model2DB from Order. Register them as the "models" app.

Create the tables with Aerich (`aerich init-db`) or `Tortoise.generate_schemas()`. Review them before using them.
"""

import enum

from tortoise import fields
from tortoise.models import Model


class OrderStatus(str, enum.Enum):
    DRAFT = "draft"
    PAID = "paid"
    SHIPPED = "shipped"
    CANCELLED = "cancelled"


class Customer(Model):
    id = fields.BigIntField(primary_key=True, generated=False)
    email = fields.TextField()
    full_name = fields.TextField()
    phone = fields.TextField(null=True)
    created_at = fields.DatetimeField()
    shipping_address_street = fields.TextField()
    shipping_address_city = fields.TextField()
    shipping_address_postal_code = fields.TextField()
    shipping_address_country = fields.TextField()

    class Meta:
        table = "customers"


class Order(Model):
    id = fields.BigIntField(primary_key=True, generated=False)
    status = fields.CharEnumField(OrderStatus, max_length=20)
    coupon_code = fields.TextField(null=True)
    placed_at = fields.DatetimeField()
    customer = fields.ForeignKeyField("models.Customer", related_name=False, on_delete=fields.RESTRICT, db_index=True)

    class Meta:
        table = "orders"


class OrderLine(Model):
    id = fields.BigIntField(primary_key=True)
    quantity = fields.FloatField()
    unit_price = fields.FloatField()
    order = fields.ForeignKeyField("models.Order", related_name="lines", on_delete=fields.CASCADE, db_index=True)
    product = fields.ForeignKeyField("models.Product", related_name=False, on_delete=fields.RESTRICT, db_index=True)

    class Meta:
        table = "order_lines"


class Product(Model):
    id = fields.BigIntField(primary_key=True, generated=False)
    sku = fields.TextField()
    name = fields.TextField()
    price = fields.FloatField()
    attributes = fields.JSONField()
    categories = fields.ManyToManyField("models.Category", through="categories_products", forward_key="category_id", backward_key="product_id", related_name="products", on_delete=fields.CASCADE)

    class Meta:
        table = "products"


class Category(Model):
    id = fields.BigIntField(primary_key=True, generated=False)
    name = fields.TextField()

    class Meta:
        table = "categories"


class OrderTag(Model):
    order = fields.ForeignKeyField("models.Order", related_name="tags", on_delete=fields.CASCADE)
    position = fields.IntField()
    value = fields.TextField()

    class Meta:
        table = "order_tags"
        unique_together = (("order", "position"),)
