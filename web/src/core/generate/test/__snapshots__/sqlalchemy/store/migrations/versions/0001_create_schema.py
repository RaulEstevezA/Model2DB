"""Create the Order schema.

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
        "customers",
        sa.Column("id", sa.BigInteger, nullable=False, autoincrement=False),
        sa.Column("email", sa.Text, nullable=False),
        sa.Column("full_name", sa.Text, nullable=False),
        sa.Column("phone", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("shipping_address_street", sa.Text, nullable=False),
        sa.Column("shipping_address_city", sa.Text, nullable=False),
        sa.Column("shipping_address_postal_code", sa.Text, nullable=False),
        sa.Column("shipping_address_country", sa.Text, nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_customers"),
    )
    op.create_table(
        "orders",
        sa.Column("id", sa.BigInteger, nullable=False, autoincrement=False),
        sa.Column("status", sa.Enum("draft", "paid", "shipped", "cancelled", native_enum=False, create_constraint=True, length=20, name="ck_order_status"), nullable=False),
        sa.Column("coupon_code", sa.Text, nullable=True),
        sa.Column("placed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("customer_id", sa.BigInteger, nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_orders"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], name="fk_orders_customer_id"),
    )
    op.create_index("ix_orders_customer_id", "orders", ["customer_id"], unique=False)
    op.create_table(
        "products",
        sa.Column("id", sa.BigInteger, nullable=False, autoincrement=False),
        sa.Column("sku", sa.Text, nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("price", sa.Double, nullable=False),
        sa.Column("attributes", sa.JSON, nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_products"),
    )
    op.create_table(
        "order_lines",
        sa.Column("id", sa.BigInteger, sa.Identity(), nullable=False),
        sa.Column("quantity", sa.Double, nullable=False),
        sa.Column("unit_price", sa.Double, nullable=False),
        sa.Column("order_id", sa.BigInteger, nullable=False),
        sa.Column("product_id", sa.BigInteger, nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_order_lines"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], name="fk_order_lines_order_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], name="fk_order_lines_product_id"),
    )
    op.create_index("ix_order_lines_order_id", "order_lines", ["order_id"], unique=False)
    op.create_index("ix_order_lines_product_id", "order_lines", ["product_id"], unique=False)
    op.create_table(
        "categories",
        sa.Column("id", sa.BigInteger, nullable=False, autoincrement=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_categories"),
    )
    op.create_table(
        "order_tags",
        sa.Column("order_id", sa.BigInteger, nullable=False),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("value", sa.Text, nullable=False),
        sa.PrimaryKeyConstraint("order_id", "position", name="pk_order_tags"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], name="fk_order_tags_order_id", ondelete="CASCADE"),
    )
    op.create_table(
        "categories_products",
        sa.Column("product_id", sa.BigInteger, nullable=False),
        sa.Column("category_id", sa.BigInteger, nullable=False),
        sa.PrimaryKeyConstraint("product_id", "category_id", name="pk_categories_products"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], name="fk_categories_products_product_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], name="fk_categories_products_category_id", ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("categories_products")
    op.drop_table("order_tags")
    op.drop_table("categories")
    op.drop_table("order_lines")
    op.drop_table("products")
    op.drop_table("orders")
    op.drop_table("customers")
