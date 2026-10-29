"""Initial migration written by Model2DB from Invoice, for the app labelled "app".

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
                ("customer_id", models.IntegerField(primary_key=True, serialize=False)),
                ("name", models.TextField()),
                ("email", models.TextField()),
                ("billing_address_street", models.TextField()),
                ("billing_address_city", models.TextField()),
                ("billing_address_zip_code", models.TextField()),
            ],
            options={"db_table": "customers"},
        ),
        migrations.CreateModel(
            name="Invoice",
            fields=[
                ("invoice_id", models.IntegerField(primary_key=True, serialize=False)),
                ("number", models.TextField()),
                ("issued_at", models.DateTimeField()),
                ("currency", models.TextField()),
                ("paid", models.BooleanField()),
                ("customer", models.ForeignKey("app.Customer", on_delete=models.PROTECT, related_name="+")),
                ("notes", models.JSONField(null=True, blank=True)),
            ],
            options={"db_table": "invoices"},
        ),
        migrations.CreateModel(
            name="Line",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("description", models.TextField()),
                ("qty", models.IntegerField()),
                ("unit_price", models.FloatField()),
                ("tax_rate", models.FloatField()),
                ("invoice", models.ForeignKey("app.Invoice", on_delete=models.CASCADE, related_name="lines")),
            ],
            options={"db_table": "lines"},
        ),
        migrations.CreateModel(
            name="InvoiceLabel",
            fields=[
                ("pk", models.CompositePrimaryKey("invoice", "position", blank=True, editable=False, primary_key=True, serialize=False)),
                ("invoice", models.ForeignKey("app.Invoice", on_delete=models.CASCADE, related_name="labels")),
                ("position", models.IntegerField()),
                ("value", models.TextField()),
            ],
            options={"db_table": "invoice_labels"},
        ),
    ]
