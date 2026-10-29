"""SQLAlchemy models written by Model2DB from Author. Review them before using them."""

from __future__ import annotations

import datetime
import decimal
import enum

from sqlalchemy import BigInteger, Column, Date, Enum, ForeignKey, Integer, Numeric, String, Table, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def enum_values(enum_class: type[enum.Enum]) -> list[str]:
    """Store the values of an enum (`paid`), not the names of its members (`PAID`)."""
    return [str(member.value) for member in enum_class]


class Genre(enum.Enum):
    FICTION = "FICTION"
    ESSAY = "ESSAY"
    POETRY = "POETRY"
    SCIENCE = "SCIENCE"


class Base(DeclarativeBase):
    pass


books_tags = Table(
    "books_tags",
    Base.metadata,
    Column("book_id", BigInteger, ForeignKey("books.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_code", Text, ForeignKey("tags.code", ondelete="CASCADE"), primary_key=True),
)


class Author(Base):
    __tablename__ = "authors"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(Text, unique=True)

    books: Mapped[list[Book]] = relationship(back_populates="author", foreign_keys="Book.author_id")


class Book(Base):
    __tablename__ = "books"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    isbn: Mapped[str] = mapped_column(String(13), unique=True)
    title: Mapped[str] = mapped_column(Text)
    price: Mapped[decimal.Decimal] = mapped_column(Numeric(8, 2))
    published_on: Mapped[datetime.date] = mapped_column(Date)
    genre: Mapped[Genre] = mapped_column(Enum(Genre, native_enum=False, create_constraint=True, length=20, name="ck_genre", values_callable=enum_values))
    author_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("authors.id"), index=True)
    shelf_room: Mapped[str] = mapped_column(Text)
    shelf_row: Mapped[int | None] = mapped_column(Integer)

    author: Mapped[Author] = relationship(back_populates="books", foreign_keys="Book.author_id")
    tags: Mapped[list[Tag]] = relationship(secondary=books_tags)


class Tag(Base):
    __tablename__ = "tags"

    code: Mapped[str] = mapped_column(Text, primary_key=True)
    label: Mapped[str] = mapped_column(Text)
