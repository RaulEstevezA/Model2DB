"""SQLAlchemy models written by Model2DB from Invoice. Review them before using them."""

from __future__ import annotations

import datetime
from typing import Any

from sqlalchemy import BigInteger, Boolean, DateTime, Double, ForeignKey, Integer, JSON, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Invoice(Base):
    __tablename__ = "invoices"

    invoice_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    number: Mapped[str] = mapped_column(Text)
    issued_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True))
    currency: Mapped[str] = mapped_column(Text)
    paid: Mapped[bool] = mapped_column(Boolean)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.customer_id"), index=True)
    notes: Mapped[Any | None] = mapped_column(JSON)

    customer: Mapped[Customer] = relationship(foreign_keys="Invoice.customer_id")
    lines: Mapped[list[Line]] = relationship(back_populates="invoice", foreign_keys="Line.invoice_id", cascade="all, delete-orphan")
    labels: Mapped[list[InvoiceLabel]] = relationship(back_populates="invoice", foreign_keys="InvoiceLabel.invoice_id", cascade="all, delete-orphan")


class Customer(Base):
    __tablename__ = "customers"

    customer_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(Text)
    email: Mapped[str] = mapped_column(Text)
    billing_address_street: Mapped[str] = mapped_column(Text)
    billing_address_city: Mapped[str] = mapped_column(Text)
    billing_address_zip_code: Mapped[str] = mapped_column(Text)


class Line(Base):
    __tablename__ = "lines"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    description: Mapped[str] = mapped_column(Text)
    qty: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[float] = mapped_column(Double)
    tax_rate: Mapped[float] = mapped_column(Double)
    invoice_id: Mapped[int] = mapped_column(Integer, ForeignKey("invoices.invoice_id", ondelete="CASCADE"), index=True)

    invoice: Mapped[Invoice] = relationship(back_populates="lines", foreign_keys="Line.invoice_id")


class InvoiceLabel(Base):
    __tablename__ = "invoice_labels"

    invoice_id: Mapped[int] = mapped_column(Integer, ForeignKey("invoices.invoice_id", ondelete="CASCADE"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, primary_key=True)
    value: Mapped[str] = mapped_column(Text)

    invoice: Mapped[Invoice] = relationship(back_populates="labels", foreign_keys="InvoiceLabel.invoice_id")
