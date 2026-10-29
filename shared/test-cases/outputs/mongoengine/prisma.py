"""MongoEngine documents written by Model2DB from User. Review them before using them."""

import mongoengine as me


class Profile(me.EmbeddedDocument):
    bio = me.StringField()
    website = me.StringField()


class Comment(me.EmbeddedDocument):
    text = me.StringField(required=True)
    writtenAt = me.DateTimeField(required=True, db_field="written_at")
    rating = me.IntField()


class User(me.Document):
    id = me.StringField(primary_key=True)
    email = me.StringField(required=True, unique=True)
    name = me.StringField()
    profile = me.EmbeddedDocumentField("Profile")
    posts = me.ListField(me.ReferenceField("Post"))
    createdAt = me.DateTimeField(db_field="created_at")

    meta = {"collection": "users"}


class Post(me.Document):
    id = me.IntField(primary_key=True)
    title = me.StringField(required=True)
    body = me.StringField(required=True)
    published = me.BooleanField()
    authorId = me.StringField(required=True, db_field="author_id")
    comments = me.ListField(me.EmbeddedDocumentField("Comment"))
    tags = me.ListField(me.StringField())

    meta = {"collection": "posts", "indexes": [{"fields": ["authorId"], "name": "ix_posts_author_id"}]}
