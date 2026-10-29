"""SQLModel models written by Model2DB from Invoice. Review them before using them."""

import datetime
from typing import Any, Optional

from sqlalchemy import BigInteger, Boolean, Column, DateTime, Double, ForeignKey, Integer, JSON, Text
from sqlmodel import Field, Relationship, SQLModel


class Invoice(SQLModel, table=True):
    __tablename__ = "invoices"

    invoice_id: int = Field(sa_column=Column(Integer, primary_key=True, autoincrement=False))
    number: str = Field(sa_column=Column(Text, nullable=False))
    issued_at: datetime.datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    currency: str = Field(sa_column=Column(Text, nullable=False))
    paid: bool = Field(sa_column=Column(Boolean, nullable=False))
    customer_id: int = Field(sa_column=Column(Integer, ForeignKey("customers.customer_id"), index=True, nullable=False))
    notes: Any | None = Field(default=None, sa_column=Column(JSON, nullable=True))

    customer: Optional["Customer"] = Relationship(sa_relationship_kwargs={"foreign_keys": "Invoice.customer_id"})
    lines: list["Line"] = Relationship(back_populates="invoice", sa_relationship_kwargs={"foreign_keys": "Line.invoice_id", "cascade": "all, delete-orphan"})
    labels: list["InvoiceLabel"] = Relationship(back_populates="invoice", sa_relationship_kwargs={"foreign_keys": "InvoiceLabel.invoice_id", "cascade": "all, delete-orphan"})


class Customer(SQLModel, table=True):
    __tablename__ = "customers"

    customer_id: int = Field(sa_column=Column(Integer, primary_key=True, autoincrement=False))
    name: str = Field(sa_column=Column(Text, nullable=False))
    email: str = Field(sa_column=Column(Text, nullable=False))
    billing_address_street: str = Field(sa_column=Column(Text, nullable=False))
    billing_address_city: str = Field(sa_column=Column(Text, nullable=False))
    billing_address_zip_code: str = Field(sa_column=Column(Text, nullable=False))


class Line(SQLModel, table=True):
    __tablename__ = "lines"

    id: int | None = Field(default=None, sa_column=Column(BigInteger().with_variant(Integer(), "sqlite"), primary_key=True))
    description: str = Field(sa_column=Column(Text, nullable=False))
    qty: int = Field(sa_column=Column(Integer, nullable=False))
    unit_price: float = Field(sa_column=Column(Double, nullable=False))
    tax_rate: float = Field(sa_column=Column(Double, nullable=False))
    invoice_id: int = Field(sa_column=Column(Integer, ForeignKey("invoices.invoice_id", ondelete="CASCADE"), index=True, nullable=False))

    invoice: Optional["Invoice"] = Relationship(back_populates="lines", sa_relationship_kwargs={"foreign_keys": "Line.invoice_id"})


class InvoiceLabel(SQLModel, table=True):
    __tablename__ = "invoice_labels"

    invoice_id: int = Field(sa_column=Column(Integer, ForeignKey("invoices.invoice_id", ondelete="CASCADE"), primary_key=True))
    position: int = Field(sa_column=Column(Integer, primary_key=True))
    value: str = Field(sa_column=Column(Text, nullable=False))

    invoice: Optional["Invoice"] = Relationship(back_populates="labels", sa_relationship_kwargs={"foreign_keys": "InvoiceLabel.invoice_id"})
