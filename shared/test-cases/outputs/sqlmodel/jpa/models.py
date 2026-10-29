"""SQLModel models written by Model2DB from Author. Review them before using them."""

import datetime
import decimal
import enum
from typing import Optional

from sqlalchemy import BigInteger, Column, Date, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlmodel import Field, Relationship, SQLModel


def enum_values(enum_class: type[enum.Enum]) -> list[str]:
    """Store the values of an enum (`paid`), not the names of its members (`PAID`)."""
    return [str(member.value) for member in enum_class]


class Genre(enum.Enum):
    FICTION = "FICTION"
    ESSAY = "ESSAY"
    POETRY = "POETRY"
    SCIENCE = "SCIENCE"


class BookTagLink(SQLModel, table=True):
    __tablename__ = "books_tags"

    book_id: int = Field(sa_column=Column(BigInteger, ForeignKey("books.id", ondelete="CASCADE"), primary_key=True))
    tag_code: str = Field(sa_column=Column(Text, ForeignKey("tags.code", ondelete="CASCADE"), primary_key=True))


class Author(SQLModel, table=True):
    __tablename__ = "authors"

    id: int | None = Field(default=None, sa_column=Column(BigInteger().with_variant(Integer(), "sqlite"), primary_key=True))
    name: str = Field(sa_column=Column(String(120), nullable=False))
    email: str = Field(sa_column=Column(Text, unique=True, nullable=False))

    books: list["Book"] = Relationship(back_populates="author", sa_relationship_kwargs={"foreign_keys": "Book.author_id"})


class Book(SQLModel, table=True):
    __tablename__ = "books"

    id: int | None = Field(default=None, sa_column=Column(BigInteger().with_variant(Integer(), "sqlite"), primary_key=True))
    isbn: str = Field(sa_column=Column(String(13), unique=True, nullable=False))
    title: str = Field(sa_column=Column(Text, nullable=False))
    price: decimal.Decimal = Field(sa_column=Column(Numeric(8, 2), nullable=False))
    published_on: datetime.date = Field(sa_column=Column(Date, nullable=False))
    genre: Genre = Field(sa_column=Column(Enum(Genre, native_enum=False, create_constraint=True, length=20, name="ck_genre", values_callable=enum_values), nullable=False))
    author_id: int = Field(sa_column=Column(BigInteger, ForeignKey("authors.id"), index=True, nullable=False))
    shelf_room: str = Field(sa_column=Column(Text, nullable=False))
    shelf_row: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))

    author: Optional["Author"] = Relationship(back_populates="books", sa_relationship_kwargs={"foreign_keys": "Book.author_id"})
    tags: list["Tag"] = Relationship(link_model=BookTagLink)


class Tag(SQLModel, table=True):
    __tablename__ = "tags"

    code: str = Field(sa_column=Column(Text, primary_key=True))
    label: str = Field(sa_column=Column(Text, nullable=False))
