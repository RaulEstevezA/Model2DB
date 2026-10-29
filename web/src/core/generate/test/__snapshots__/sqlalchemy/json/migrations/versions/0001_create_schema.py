"""Create the Invoice schema.

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
        sa.Column("customer_id", sa.Integer, nullable=False, autoincrement=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("email", sa.Text, nullable=False),
        sa.Column("billing_address_street", sa.Text, nullable=False),
        sa.Column("billing_address_city", sa.Text, nullable=False),
        sa.Column("billing_address_zip_code", sa.Text, nullable=False),
        sa.PrimaryKeyConstraint("customer_id", name="pk_customers"),
    )
    op.create_table(
        "invoices",
        sa.Column("invoice_id", sa.Integer, nullable=False, autoincrement=False),
        sa.Column("number", sa.Text, nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("currency", sa.Text, nullable=False),
        sa.Column("paid", sa.Boolean, nullable=False),
        sa.Column("customer_id", sa.Integer, nullable=False),
        sa.Column("notes", sa.JSON, nullable=True),
        sa.PrimaryKeyConstraint("invoice_id", name="pk_invoices"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.customer_id"], name="fk_invoices_customer_id"),
    )
    op.create_index("ix_invoices_customer_id", "invoices", ["customer_id"], unique=False)
    op.create_table(
        "lines",
        sa.Column("id", sa.BigInteger, sa.Identity(), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("qty", sa.Integer, nullable=False),
        sa.Column("unit_price", sa.Double, nullable=False),
        sa.Column("tax_rate", sa.Double, nullable=False),
        sa.Column("invoice_id", sa.Integer, nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_lines"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.invoice_id"], name="fk_lines_invoice_id", ondelete="CASCADE"),
    )
    op.create_index("ix_lines_invoice_id", "lines", ["invoice_id"], unique=False)
    op.create_table(
        "invoice_labels",
        sa.Column("invoice_id", sa.Integer, nullable=False),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("value", sa.Text, nullable=False),
        sa.PrimaryKeyConstraint("invoice_id", "position", name="pk_invoice_labels"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.invoice_id"], name="fk_invoice_labels_invoice_id", ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("invoice_labels")
    op.drop_table("lines")
    op.drop_table("invoices")
    op.drop_table("customers")
