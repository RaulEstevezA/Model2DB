"""Django models written by Model2DB from Author. Review them before using them."""

from django.db import models


class Genre(models.TextChoices):
    FICTION = "FICTION", "FICTION"
    ESSAY = "ESSAY", "ESSAY"
    POETRY = "POETRY", "POETRY"
    SCIENCE = "SCIENCE", "SCIENCE"


class Author(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=120)
    email = models.TextField(unique=True)

    class Meta:
        db_table = "authors"


class Book(models.Model):
    id = models.BigAutoField(primary_key=True)
    isbn = models.CharField(max_length=13, unique=True)
    title = models.TextField()
    price = models.DecimalField(max_digits=8, decimal_places=2)
    published_on = models.DateField()
    genre = models.CharField(max_length=20, choices=Genre.choices)
    author = models.ForeignKey("Author", on_delete=models.PROTECT, related_name="books")
    shelf_room = models.TextField()
    shelf_row = models.IntegerField(null=True, blank=True)
    tags = models.ManyToManyField("Tag", through="BookTagLink", related_name="+")

    class Meta:
        db_table = "books"
        constraints = [models.CheckConstraint(condition=models.Q(genre__in=["FICTION", "ESSAY", "POETRY", "SCIENCE"]), name="ck_books_genre")]


class Tag(models.Model):
    code = models.TextField(primary_key=True)
    label = models.TextField()

    class Meta:
        db_table = "tags"


class BookTagLink(models.Model):
    pk = models.CompositePrimaryKey("book", "tag_code")
    book = models.ForeignKey("Book", on_delete=models.CASCADE, related_name="+")
    tag_code = models.ForeignKey("Tag", on_delete=models.CASCADE, related_name="+", db_column="tag_code")

    class Meta:
        db_table = "books_tags"
