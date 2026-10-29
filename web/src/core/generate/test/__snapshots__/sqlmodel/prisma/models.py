"""SQLModel models written by Model2DB from User. Review them before using them."""

import datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlmodel import Field, Relationship, SQLModel


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: str = Field(sa_column=Column(Text, primary_key=True))
    email: str = Field(sa_column=Column(Text, unique=True, nullable=False))
    name: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: datetime.datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False))
    profile_bio: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    profile_website: str | None = Field(default=None, sa_column=Column(Text, nullable=True))

    posts: list["Post"] = Relationship(back_populates="author", sa_relationship_kwargs={"foreign_keys": "Post.author_id"})


class Post(SQLModel, table=True):
    __tablename__ = "posts"

    id: int | None = Field(default=None, sa_column=Column(Integer, primary_key=True))
    title: str = Field(sa_column=Column(String(200), nullable=False))
    body: str = Field(sa_column=Column(Text, nullable=False))
    published: bool = Field(default=False, sa_column=Column(Boolean, default=False, nullable=False))
    author_id: str = Field(sa_column=Column(Text, ForeignKey("users.id"), index=True, nullable=False))

    author: Optional["User"] = Relationship(back_populates="posts", sa_relationship_kwargs={"foreign_keys": "Post.author_id"})
    comments: list["Comment"] = Relationship(back_populates="post", sa_relationship_kwargs={"foreign_keys": "Comment.post_id", "cascade": "all, delete-orphan"})
    tags: list["PostTag"] = Relationship(back_populates="post", sa_relationship_kwargs={"foreign_keys": "PostTag.post_id", "cascade": "all, delete-orphan"})


class Comment(SQLModel, table=True):
    __tablename__ = "comments"

    id: int | None = Field(default=None, sa_column=Column(BigInteger().with_variant(Integer(), "sqlite"), primary_key=True))
    text: str = Field(sa_column=Column(Text, nullable=False))
    written_at: datetime.datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    rating: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    post_id: int = Field(sa_column=Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), index=True, nullable=False))

    post: Optional["Post"] = Relationship(back_populates="comments", sa_relationship_kwargs={"foreign_keys": "Comment.post_id"})


class PostTag(SQLModel, table=True):
    __tablename__ = "post_tags"

    post_id: int = Field(sa_column=Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True))
    position: int = Field(sa_column=Column(Integer, primary_key=True))
    value: str = Field(sa_column=Column(Text, nullable=False))

    post: Optional["Post"] = Relationship(back_populates="tags", sa_relationship_kwargs={"foreign_keys": "PostTag.post_id"})
