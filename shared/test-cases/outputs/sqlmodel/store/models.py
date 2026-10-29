"""SQLModel models written by Model2DB from Order. Review them before using them."""

import datetime
import enum
from typing import Any, Optional

from sqlalchemy import BigInteger, Column, DateTime, Double, Enum, ForeignKey, Integer, JSON, Text
from sqlmodel import Field, Relationship, SQLModel


def enum_values(enum_class: type[enum.Enum]) -> list[str]:
    """Store the values of an enum (`paid`), not the names of its members (`PAID`)."""
    return [str(member.value) for member in enum_class]


class OrderStatus(enum.Enum):
    DRAFT = "draft"
    PAID = "paid"
    SHIPPED = "shipped"
    CANCELLED = "cancelled"


class ProductCategoryLink(SQLModel, table=True):
    __tablename__ = "categories_products"

    product_id: int = Field(sa_column=Column(BigInteger, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True))
    category_id: int = Field(sa_column=Column(BigInteger, ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True))


class Customer(SQLModel, table=True):
    __tablename__ = "customers"

    id: int = Field(sa_column=Column(BigInteger, primary_key=True, autoincrement=False))
    email: str = Field(sa_column=Column(Text, nullable=False))
    full_name: str = Field(sa_column=Column(Text, nullable=False))
    phone: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: datetime.datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    shipping_address_street: str = Field(sa_column=Column(Text, nullable=False))
    shipping_address_city: str = Field(sa_column=Column(Text, nullable=False))
    shipping_address_postal_code: str = Field(sa_column=Column(Text, nullable=False))
    shipping_address_country: str = Field(sa_column=Column(Text, nullable=False))


class Order(SQLModel, table=True):
    __tablename__ = "orders"

    id: int = Field(sa_column=Column(BigInteger, primary_key=True, autoincrement=False))
    status: OrderStatus = Field(sa_column=Column(Enum(OrderStatus, native_enum=False, create_constraint=True, length=20, name="ck_order_status", values_callable=enum_values), nullable=False))
    coupon_code: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    placed_at: datetime.datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    customer_id: int = Field(sa_column=Column(BigInteger, ForeignKey("customers.id"), index=True, nullable=False))

    customer: Optional["Customer"] = Relationship(sa_relationship_kwargs={"foreign_keys": "Order.customer_id"})
    lines: list["OrderLine"] = Relationship(back_populates="order", sa_relationship_kwargs={"foreign_keys": "OrderLine.order_id", "cascade": "all, delete-orphan"})
    tags: list["OrderTag"] = Relationship(back_populates="order", sa_relationship_kwargs={"foreign_keys": "OrderTag.order_id", "cascade": "all, delete-orphan"})


class OrderLine(SQLModel, table=True):
    __tablename__ = "order_lines"

    id: int | None = Field(default=None, sa_column=Column(BigInteger().with_variant(Integer(), "sqlite"), primary_key=True))
    quantity: float = Field(sa_column=Column(Double, nullable=False))
    unit_price: float = Field(sa_column=Column(Double, nullable=False))
    order_id: int = Field(sa_column=Column(BigInteger, ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False))
    product_id: int = Field(sa_column=Column(BigInteger, ForeignKey("products.id"), index=True, nullable=False))

    order: Optional["Order"] = Relationship(back_populates="lines", sa_relationship_kwargs={"foreign_keys": "OrderLine.order_id"})
    product: Optional["Product"] = Relationship(sa_relationship_kwargs={"foreign_keys": "OrderLine.product_id"})


class Product(SQLModel, table=True):
    __tablename__ = "products"

    id: int = Field(sa_column=Column(BigInteger, primary_key=True, autoincrement=False))
    sku: str = Field(sa_column=Column(Text, nullable=False))
    name: str = Field(sa_column=Column(Text, nullable=False))
    price: float = Field(sa_column=Column(Double, nullable=False))
    attributes: Any = Field(sa_column=Column(JSON, nullable=False))

    categories: list["Category"] = Relationship(back_populates="products", link_model=ProductCategoryLink)


class Category(SQLModel, table=True):
    __tablename__ = "categories"

    id: int = Field(sa_column=Column(BigInteger, primary_key=True, autoincrement=False))
    name: str = Field(sa_column=Column(Text, nullable=False))

    products: list["Product"] = Relationship(back_populates="categories", link_model=ProductCategoryLink)


class OrderTag(SQLModel, table=True):
    __tablename__ = "order_tags"

    order_id: int = Field(sa_column=Column(BigInteger, ForeignKey("orders.id", ondelete="CASCADE"), primary_key=True))
    position: int = Field(sa_column=Column(Integer, primary_key=True))
    value: str = Field(sa_column=Column(Text, nullable=False))

    order: Optional["Order"] = Relationship(back_populates="tags", sa_relationship_kwargs={"foreign_keys": "OrderTag.order_id"})
