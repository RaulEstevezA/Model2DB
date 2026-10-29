"""Django models written by Model2DB from User. Review them before using them."""

from django.db import models


class User(models.Model):
    id = models.TextField(primary_key=True)
    email = models.TextField(unique=True)
    name = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    profile_bio = models.TextField(null=True, blank=True)
    profile_website = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "users"


class Post(models.Model):
    id = models.AutoField(primary_key=True)
    title = models.CharField(max_length=200)
    body = models.TextField()
    published = models.BooleanField(default=False)
    author = models.ForeignKey("User", on_delete=models.PROTECT, related_name="posts")

    class Meta:
        db_table = "posts"


class Comment(models.Model):
    id = models.BigAutoField(primary_key=True)
    text = models.TextField()
    written_at = models.DateTimeField()
    rating = models.IntegerField(null=True, blank=True)
    post = models.ForeignKey("Post", on_delete=models.CASCADE, related_name="comments")

    class Meta:
        db_table = "comments"


class PostTag(models.Model):
    pk = models.CompositePrimaryKey("post", "position")
    post = models.ForeignKey("Post", on_delete=models.CASCADE, related_name="tags")
    position = models.IntegerField()
    value = models.TextField()

    class Meta:
        db_table = "post_tags"
