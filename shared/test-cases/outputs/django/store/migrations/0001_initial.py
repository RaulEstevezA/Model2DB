"""Initial migration written by Model2DB from Order, for the app labelled "app".

Rename the app label to yours, then run `python manage.py migrate`.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Customer",
            fields=[
                ("id", models.BigIntegerField(primary_key=True, serialize=False)),
                ("email", models.TextField()),
                ("full_name", models.TextField()),
                ("phone", models.TextField(null=True, blank=True)),
                ("created_at", models.DateTimeField()),
                ("shipping_address_street", models.TextField()),
                ("shipping_address_city", models.TextField()),
                ("shipping_address_postal_code", models.TextField()),
                ("shipping_address_country", models.TextField()),
            ],
            options={"db_table": "customers"},
        ),
        migrations.CreateModel(
            name="Order",
            fields=[
                ("id", models.BigIntegerField(primary_key=True, serialize=False)),
                ("status", models.CharField(max_length=20, choices=[("draft", "Draft"), ("paid", "Paid"), ("shipped", "Shipped"), ("cancelled", "Cancelled")])),
                ("coupon_code", models.TextField(null=True, blank=True)),
                ("placed_at", models.DateTimeField()),
                ("customer", models.ForeignKey("app.Customer", on_delete=models.PROTECT, related_name="+")),
            ],
            options={"db_table": "orders", "constraints": [models.CheckConstraint(condition=models.Q(status__in=["draft", "paid", "shipped", "cancelled"]), name="ck_orders_status")]},
        ),
        migrations.CreateModel(
            name="Product",
            fields=[
                ("id", models.BigIntegerField(primary_key=True, serialize=False)),
                ("sku", models.TextField()),
                ("name", models.TextField()),
                ("price", models.FloatField()),
                ("attributes", models.JSONField()),
            ],
            options={"db_table": "products"},
        ),
        migrations.CreateModel(
            name="OrderLine",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("quantity", models.FloatField()),
                ("unit_price", models.FloatField()),
                ("order", models.ForeignKey("app.Order", on_delete=models.CASCADE, related_name="lines")),
                ("product", models.ForeignKey("app.Product", on_delete=models.PROTECT, related_name="+")),
            ],
            options={"db_table": "order_lines"},
        ),
        migrations.CreateModel(
            name="Category",
            fields=[
                ("id", models.BigIntegerField(primary_key=True, serialize=False)),
                ("name", models.TextField()),
            ],
            options={"db_table": "categories"},
        ),
        migrations.CreateModel(
            name="OrderTag",
            fields=[
                ("pk", models.CompositePrimaryKey("order", "position", blank=True, editable=False, primary_key=True, serialize=False)),
                ("order", models.ForeignKey("app.Order", on_delete=models.CASCADE, related_name="tags")),
                ("position", models.IntegerField()),
                ("value", models.TextField()),
            ],
            options={"db_table": "order_tags"},
        ),
        migrations.CreateModel(
            name="ProductCategoryLink",
            fields=[
                ("pk", models.CompositePrimaryKey("product", "category", blank=True, editable=False, primary_key=True, serialize=False)),
                ("product", models.ForeignKey("app.Product", on_delete=models.CASCADE, related_name="+")),
                ("category", models.ForeignKey("app.Category", on_delete=models.CASCADE, related_name="+")),
            ],
            options={"db_table": "categories_products"},
        ),
        migrations.AddField(
            model_name="product",
            name="categories",
            field=models.ManyToManyField("app.Category", through="app.ProductCategoryLink", related_name="products"),
        ),
    ]
