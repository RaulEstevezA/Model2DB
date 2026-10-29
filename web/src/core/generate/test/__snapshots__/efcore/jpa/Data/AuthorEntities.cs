// Entities written by Model2DB from Author. Review them before using them.
using System;
using System.Collections.Generic;

namespace Example.Data;

public enum Genre
{
    Fiction,
    Essay,
    Poetry,
    Science,
}

/// <summary>The values of <see cref="Genre"/> as the database stores them.</summary>
public static class GenreValues
{
    public static string ToValue(Genre value) => value switch
    {
        Genre.Fiction => "FICTION",
        Genre.Essay => "ESSAY",
        Genre.Poetry => "POETRY",
        Genre.Science => "SCIENCE",
        _ => throw new ArgumentOutOfRangeException(nameof(value)),
    };

    public static Genre FromValue(string value) => value switch
    {
        "FICTION" => Genre.Fiction,
        "ESSAY" => Genre.Essay,
        "POETRY" => Genre.Poetry,
        "SCIENCE" => Genre.Science,
        _ => throw new ArgumentOutOfRangeException(nameof(value)),
    };
}

public class Author
{
    public long Id { get; set; }
    public string Name { get; set; } = null!;
    public string Email { get; set; } = null!;
    public List<Book> Books { get; set; } = new();
}

public class Book
{
    public long Id { get; set; }
    public string Isbn { get; set; } = null!;
    public string Title { get; set; } = null!;
    public decimal Price { get; set; }
    public DateOnly PublishedOn { get; set; }
    public Genre Genre { get; set; }
    public long AuthorId { get; set; }
    public string ShelfRoom { get; set; } = null!;
    public int? ShelfRow { get; set; }
    public Author Author { get; set; } = null!;
    public List<Tag> Tags { get; set; } = new();
}

public class Tag
{
    public string Code { get; set; } = null!;
    public string Label { get; set; } = null!;
}
