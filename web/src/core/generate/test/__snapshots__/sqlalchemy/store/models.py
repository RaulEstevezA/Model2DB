"""SQLAlchemy models written by Model2DB from Order. Review them before using them."""

from __future__ import annotations

import datetime
import enum
from typing import Any

from sqlalchemy import BigInteger, Column, DateTime, Double, Enum, ForeignKey, Integer, JSON, Table, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def enum_values(enum_class: type[enum.Enum]) -> list[str]:
    """Store the values of an enum (`paid`), not the names of its members (`PAID`)."""
    return [str(member.value) for member in enum_class]


class OrderStatus(enum.Enum):
    DRAFT = "draft"
    PAID = "paid"
    SHIPPED = "shipped"
    CANCELLED = "cancelled"


class Base(DeclarativeBase):
    pass


categories_products = Table(
    "categories_products",
    Base.metadata,
    Column("product_id", BigInteger, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", BigInteger, ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True),
)


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    email: Mapped[str] = mapped_column(Text)
    full_name: Mapped[str] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True))
    shipping_address_street: Mapped[str] = mapped_column(Text)
    shipping_address_city: Mapped[str] = mapped_column(Text)
    shipping_address_postal_code: Mapped[str] = mapped_column(Text)
    shipping_address_country: Mapped[str] = mapped_column(Text)


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus, native_enum=False, create_constraint=True, length=20, name="ck_order_status", values_callable=enum_values))
    coupon_code: Mapped[str | None] = mapped_column(Text)
    placed_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True))
    customer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("customers.id"), index=True)

    customer: Mapped[Customer] = relationship(foreign_keys="Order.customer_id")
    lines: Mapped[list[OrderLine]] = relationship(back_populates="order", foreign_keys="OrderLine.order_id", cascade="all, delete-orphan")
    tags: Mapped[list[OrderTag]] = relationship(back_populates="order", foreign_keys="OrderTag.order_id", cascade="all, delete-orphan")


class OrderLine(Base):
    __tablename__ = "order_lines"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    quantity: Mapped[float] = mapped_column(Double)
    unit_price: Mapped[float] = mapped_column(Double)
    order_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("products.id"), index=True)

    order: Mapped[Order] = relationship(back_populates="lines", foreign_keys="OrderLine.order_id")
    product: Mapped[Product] = relationship(foreign_keys="OrderLine.product_id")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    sku: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    price: Mapped[float] = mapped_column(Double)
    attributes: Mapped[Any] = mapped_column(JSON)

    categories: Mapped[list[Category]] = relationship(secondary=categories_products, back_populates="products")


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(Text)

    products: Mapped[list[Product]] = relationship(secondary=categories_products, back_populates="categories")


class OrderTag(Base):
    __tablename__ = "order_tags"

    order_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("orders.id", ondelete="CASCADE"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, primary_key=True)
    value: Mapped[str] = mapped_column(Text)

    order: Mapped[Order] = relationship(back_populates="tags", foreign_keys="OrderTag.order_id")
