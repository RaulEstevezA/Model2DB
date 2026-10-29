"""Tortoise ORM models written by Model2DB from User. Register them as the "models" app.

Create the tables with Aerich (`aerich init-db`) or `Tortoise.generate_schemas()`. Review them before using them.
"""

from tortoise import fields
from tortoise.models import Model


class User(Model):
    id = fields.CharField(max_length=255, primary_key=True)
    email = fields.CharField(max_length=255, unique=True)
    name = fields.TextField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    profile_bio = fields.TextField(null=True)
    profile_website = fields.TextField(null=True)

    class Meta:
        table = "users"


class Post(Model):
    id = fields.IntField(primary_key=True)
    title = fields.CharField(max_length=200)
    body = fields.TextField()
    published = fields.BooleanField(default=False)
    author = fields.ForeignKeyField("models.User", related_name="posts", on_delete=fields.RESTRICT, db_index=True)

    class Meta:
        table = "posts"


class Comment(Model):
    id = fields.BigIntField(primary_key=True)
    text = fields.TextField()
    written_at = fields.DatetimeField()
    rating = fields.IntField(null=True)
    post = fields.ForeignKeyField("models.Post", related_name="comments", on_delete=fields.CASCADE, db_index=True)

    class Meta:
        table = "comments"


class PostTag(Model):
    post = fields.ForeignKeyField("models.Post", related_name="tags", on_delete=fields.CASCADE)
    position = fields.IntField()
    value = fields.TextField()

    class Meta:
        table = "post_tags"
        unique_together = (("post", "position"),)
