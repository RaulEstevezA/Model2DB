"""Django models written by Model2DB from Order. Review them before using them."""

from django.db import models


class OrderStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PAID = "paid", "Paid"
    SHIPPED = "shipped", "Shipped"
    CANCELLED = "cancelled", "Cancelled"


class Customer(models.Model):
    id = models.BigIntegerField(primary_key=True)
    email = models.TextField()
    full_name = models.TextField()
    phone = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField()
    shipping_address_street = models.TextField()
    shipping_address_city = models.TextField()
    shipping_address_postal_code = models.TextField()
    shipping_address_country = models.TextField()

    class Meta:
        db_table = "customers"


class Order(models.Model):
    id = models.BigIntegerField(primary_key=True)
    status = models.CharField(max_length=20, choices=OrderStatus.choices)
    coupon_code = models.TextField(null=True, blank=True)
    placed_at = models.DateTimeField()
    customer = models.ForeignKey("Customer", on_delete=models.PROTECT, related_name="+")

    class Meta:
        db_table = "orders"
        constraints = [models.CheckConstraint(condition=models.Q(status__in=["draft", "paid", "shipped", "cancelled"]), name="ck_orders_status")]


class OrderLine(models.Model):
    id = models.BigAutoField(primary_key=True)
    quantity = models.FloatField()
    unit_price = models.FloatField()
    order = models.ForeignKey("Order", on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey("Product", on_delete=models.PROTECT, related_name="+")

    class Meta:
        db_table = "order_lines"


class Product(models.Model):
    id = models.BigIntegerField(primary_key=True)
    sku = models.TextField()
    name = models.TextField()
    price = models.FloatField()
    attributes = models.JSONField()
    categories = models.ManyToManyField("Category", through="ProductCategoryLink", related_name="products")

    class Meta:
        db_table = "products"


class Category(models.Model):
    id = models.BigIntegerField(primary_key=True)
    name = models.TextField()

    class Meta:
        db_table = "categories"


class OrderTag(models.Model):
    pk = models.CompositePrimaryKey("order", "position")
    order = models.ForeignKey("Order", on_delete=models.CASCADE, related_name="tags")
    position = models.IntegerField()
    value = models.TextField()

    class Meta:
        db_table = "order_tags"


class ProductCategoryLink(models.Model):
    pk = models.CompositePrimaryKey("product", "category")
    product = models.ForeignKey("Product", on_delete=models.CASCADE, related_name="+")
    category = models.ForeignKey("Category", on_delete=models.CASCADE, related_name="+")

    class Meta:
        db_table = "categories_products"
