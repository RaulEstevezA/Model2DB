// Entities written by Model2DB from User. Review them before using them.
using System;
using System.Collections.Generic;

namespace Example.Data;

public class User
{
    public string Id { get; set; } = null!;
    public string Email { get; set; } = null!;
    public string? Name { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public string? ProfileBio { get; set; }
    public string? ProfileWebsite { get; set; }
    public List<Post> Posts { get; set; } = new();
}

public class Post
{
    public int Id { get; set; }
    public string Title { get; set; } = null!;
    public string Body { get; set; } = null!;
    public bool Published { get; set; } = false;
    public string AuthorId { get; set; } = null!;
    public User Author { get; set; } = null!;
    public List<Comment> Comments { get; set; } = new();
    public List<PostTag> Tags { get; set; } = new();
}

public class Comment
{
    public long Id { get; set; }
    public string Text { get; set; } = null!;
    public DateTimeOffset WrittenAt { get; set; }
    public int? Rating { get; set; }
    public int PostId { get; set; }
    public Post Post { get; set; } = null!;
}

public class PostTag
{
    public int PostId { get; set; }
    public int Position { get; set; }
    public string Value { get; set; } = null!;
    public Post Post { get; set; } = null!;
}
