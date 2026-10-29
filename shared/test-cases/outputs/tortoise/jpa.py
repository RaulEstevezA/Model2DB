"""Tortoise ORM models written by Model2DB from Author. Register them as the "models" app.

Create the tables with Aerich (`aerich init-db`) or `Tortoise.generate_schemas()`. Review them before using them.
"""

import enum

from tortoise import fields
from tortoise.models import Model


class Genre(str, enum.Enum):
    FICTION = "FICTION"
    ESSAY = "ESSAY"
    POETRY = "POETRY"
    SCIENCE = "SCIENCE"


class Author(Model):
    id = fields.BigIntField(primary_key=True)
    name = fields.CharField(max_length=120)
    email = fields.CharField(max_length=255, unique=True)

    class Meta:
        table = "authors"


class Book(Model):
    id = fields.BigIntField(primary_key=True)
    isbn = fields.CharField(max_length=13, unique=True)
    title = fields.TextField()
    price = fields.DecimalField(max_digits=8, decimal_places=2)
    published_on = fields.DateField()
    genre = fields.CharEnumField(Genre, max_length=20)
    author = fields.ForeignKeyField("models.Author", related_name="books", on_delete=fields.RESTRICT, db_index=True)
    shelf_room = fields.TextField()
    shelf_row = fields.IntField(null=True)
    tags = fields.ManyToManyField("models.Tag", through="books_tags", forward_key="tag_code", backward_key="book_id", related_name=False, on_delete=fields.CASCADE)

    class Meta:
        table = "books"


class Tag(Model):
    code = fields.CharField(max_length=255, primary_key=True)
    label = fields.TextField()

    class Meta:
        table = "tags"
