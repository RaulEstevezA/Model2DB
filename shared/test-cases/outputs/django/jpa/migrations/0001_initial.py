"""Initial migration written by Model2DB from Author, for the app labelled "app".

Rename the app label to yours, then run `python manage.py migrate`.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Author",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=120)),
                ("email", models.TextField(unique=True)),
            ],
            options={"db_table": "authors"},
        ),
        migrations.CreateModel(
            name="Book",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("isbn", models.CharField(max_length=13, unique=True)),
                ("title", models.TextField()),
                ("price", models.DecimalField(max_digits=8, decimal_places=2)),
                ("published_on", models.DateField()),
                ("genre", models.CharField(max_length=20, choices=[("FICTION", "FICTION"), ("ESSAY", "ESSAY"), ("POETRY", "POETRY"), ("SCIENCE", "SCIENCE")])),
                ("author", models.ForeignKey("app.Author", on_delete=models.PROTECT, related_name="books")),
                ("shelf_room", models.TextField()),
                ("shelf_row", models.IntegerField(null=True, blank=True)),
            ],
            options={"db_table": "books", "constraints": [models.CheckConstraint(condition=models.Q(genre__in=["FICTION", "ESSAY", "POETRY", "SCIENCE"]), name="ck_books_genre")]},
        ),
        migrations.CreateModel(
            name="Tag",
            fields=[
                ("code", models.TextField(primary_key=True, serialize=False)),
                ("label", models.TextField()),
            ],
            options={"db_table": "tags"},
        ),
        migrations.CreateModel(
            name="BookTagLink",
            fields=[
                ("pk", models.CompositePrimaryKey("book", "tag_code", blank=True, editable=False, primary_key=True, serialize=False)),
                ("book", models.ForeignKey("app.Book", on_delete=models.CASCADE, related_name="+")),
                ("tag_code", models.ForeignKey("app.Tag", on_delete=models.CASCADE, related_name="+", db_column="tag_code")),
            ],
            options={"db_table": "books_tags"},
        ),
        migrations.AddField(
            model_name="book",
            name="tags",
            field=models.ManyToManyField("app.Tag", through="app.BookTagLink", related_name="+"),
        ),
    ]
