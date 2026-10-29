"""Create the User schema.

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
        "users",
        sa.Column("id", sa.Text, nullable=False),
        sa.Column("email", sa.Text, nullable=False),
        sa.Column("name", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("profile_bio", sa.Text, nullable=True),
        sa.Column("profile_website", sa.Text, nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_table(
        "posts",
        sa.Column("id", sa.Integer, sa.Identity(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("published", sa.Boolean, nullable=False),
        sa.Column("author_id", sa.Text, nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_posts"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], name="fk_posts_author_id"),
    )
    op.create_index("ix_posts_author_id", "posts", ["author_id"], unique=False)
    op.create_table(
        "comments",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), sa.Identity(), nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("written_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("rating", sa.Integer, nullable=True),
        sa.Column("post_id", sa.Integer, nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_comments"),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], name="fk_comments_post_id", ondelete="CASCADE"),
    )
    op.create_index("ix_comments_post_id", "comments", ["post_id"], unique=False)
    op.create_table(
        "post_tags",
        sa.Column("post_id", sa.Integer, nullable=False),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("value", sa.Text, nullable=False),
        sa.PrimaryKeyConstraint("post_id", "position", name="pk_post_tags"),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], name="fk_post_tags_post_id", ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("post_tags")
    op.drop_table("comments")
    op.drop_table("posts")
    op.drop_table("users")
