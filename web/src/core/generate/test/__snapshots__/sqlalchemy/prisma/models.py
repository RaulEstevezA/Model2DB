"""SQLAlchemy models written by Model2DB from User. Review them before using them."""

from __future__ import annotations

import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    email: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    profile_bio: Mapped[str | None] = mapped_column(Text)
    profile_website: Mapped[str | None] = mapped_column(Text)

    posts: Mapped[list[Post]] = relationship(back_populates="author", foreign_keys="Post.author_id")


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    published: Mapped[bool] = mapped_column(Boolean, default=False)
    author_id: Mapped[str] = mapped_column(Text, ForeignKey("users.id"), index=True)

    author: Mapped[User] = relationship(back_populates="posts", foreign_keys="Post.author_id")
    comments: Mapped[list[Comment]] = relationship(back_populates="post", foreign_keys="Comment.post_id", cascade="all, delete-orphan")
    tags: Mapped[list[PostTag]] = relationship(back_populates="post", foreign_keys="PostTag.post_id", cascade="all, delete-orphan")


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    text: Mapped[str] = mapped_column(Text)
    written_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True))
    rating: Mapped[int | None] = mapped_column(Integer)
    post_id: Mapped[int] = mapped_column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), index=True)

    post: Mapped[Post] = relationship(back_populates="comments", foreign_keys="Comment.post_id")


class PostTag(Base):
    __tablename__ = "post_tags"

    post_id: Mapped[int] = mapped_column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, primary_key=True)
    value: Mapped[str] = mapped_column(Text)

    post: Mapped[Post] = relationship(back_populates="tags", foreign_keys="PostTag.post_id")
