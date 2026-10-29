"""MongoEngine documents written by Model2DB from Author. Review them before using them."""

import enum

import mongoengine as me


class Genre(str, enum.Enum):
    FICTION = "FICTION"
    ESSAY = "ESSAY"
    POETRY = "POETRY"
    SCIENCE = "SCIENCE"


class Shelf(me.EmbeddedDocument):
    room = me.StringField(required=True)
    row = me.IntField()


class Tag(me.EmbeddedDocument):
    code = me.StringField(required=True)
    label = me.StringField(required=True)


class Author(me.Document):
    id = me.LongField(primary_key=True)
    name = me.StringField(required=True)
    email = me.StringField(required=True, unique=True)
    books = me.ListField(me.ReferenceField("Book"))

    meta = {"collection": "authors"}


class Book(me.Document):
    id = me.LongField(primary_key=True)
    isbn = me.StringField(required=True, unique=True)
    title = me.StringField(required=True)
    author = me.ReferenceField("Author", required=True)
    price = me.Decimal128Field(required=True)
    publishedOn = me.DateTimeField(required=True, db_field="published_on")
    genre = me.EnumField(Genre, required=True)
    shelf = me.EmbeddedDocumentField("Shelf", required=True)
    tags = me.ListField(me.EmbeddedDocumentField("Tag"))

    meta = {"collection": "books", "indexes": [{"fields": ["author"], "name": "ix_books_author"}]}
