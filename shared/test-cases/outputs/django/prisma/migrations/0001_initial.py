"""Initial migration written by Model2DB from User, for the app labelled "app".

Rename the app label to yours, then run `python manage.py migrate`.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="User",
            fields=[
                ("id", models.TextField(primary_key=True, serialize=False)),
                ("email", models.TextField(unique=True)),
                ("name", models.TextField(null=True, blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("profile_bio", models.TextField(null=True, blank=True)),
                ("profile_website", models.TextField(null=True, blank=True)),
            ],
            options={"db_table": "users"},
        ),
        migrations.CreateModel(
            name="Post",
            fields=[
                ("id", models.AutoField(primary_key=True, serialize=False)),
                ("title", models.CharField(max_length=200)),
                ("body", models.TextField()),
                ("published", models.BooleanField(default=False)),
                ("author", models.ForeignKey("app.User", on_delete=models.PROTECT, related_name="posts")),
            ],
            options={"db_table": "posts"},
        ),
        migrations.CreateModel(
            name="Comment",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("text", models.TextField()),
                ("written_at", models.DateTimeField()),
                ("rating", models.IntegerField(null=True, blank=True)),
                ("post", models.ForeignKey("app.Post", on_delete=models.CASCADE, related_name="comments")),
            ],
            options={"db_table": "comments"},
        ),
        migrations.CreateModel(
            name="PostTag",
            fields=[
                ("pk", models.CompositePrimaryKey("post", "position", blank=True, editable=False, primary_key=True, serialize=False)),
                ("post", models.ForeignKey("app.Post", on_delete=models.CASCADE, related_name="tags")),
                ("position", models.IntegerField()),
                ("value", models.TextField()),
            ],
            options={"db_table": "post_tags"},
        ),
    ]
