"""Create the Author schema.

Written by Model2DB. Review it before running `alembic upgrade head`.

Revision ID: 0001
Revises:
"""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "authors",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), sa.Identity(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.Text, nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_authors"),
        sa.UniqueConstraint("email", name="uq_authors_email"),
    )
    op.create_table(
        "books",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), sa.Identity(), nullable=False),
        sa.Column("isbn", sa.String(13), nullable=False),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("price", sa.Numeric(8, 2), nullable=False),
        sa.Column("published_on", sa.Date, nullable=False),
        sa.Column("genre", sa.Enum("FICTION", "ESSAY", "POETRY", "SCIENCE", native_enum=False, create_constraint=True, length=20, name="ck_genre"), nullable=False),
        sa.Column("author_id", sa.BigInteger, nullable=False),
        sa.Column("shelf_room", sa.Text, nullable=False),
        sa.Column("shelf_row", sa.Integer, nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_books"),
        sa.UniqueConstraint("isbn", name="uq_books_isbn"),
        sa.ForeignKeyConstraint(["author_id"], ["authors.id"], name="fk_books_author_id"),
    )
    op.create_index("ix_books_author_id", "books", ["author_id"], unique=False)
    op.create_table(
        "tags",
        sa.Column("code", sa.Text, nullable=False),
        sa.Column("label", sa.Text, nullable=False),
        sa.PrimaryKeyConstraint("code", name="pk_tags"),
    )
    op.create_table(
        "books_tags",
        sa.Column("book_id", sa.BigInteger, nullable=False),
        sa.Column("tag_code", sa.Text, nullable=False),
        sa.PrimaryKeyConstraint("book_id", "tag_code", name="pk_books_tags"),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], name="fk_books_tags_book_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_code"], ["tags.code"], name="fk_books_tags_tag_code", ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("books_tags")
    op.drop_table("tags")
    op.drop_table("books")
    op.drop_table("authors")
