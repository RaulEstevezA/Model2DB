<?php

namespace App\Entity;

use App\Enum\Genre;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/** Entity written by Model2DB from Author. Review it before using it. */
#[ORM\Entity]
#[ORM\Table(name: 'books')]
#[ORM\Index(name: 'ix_books_author_id', columns: ['author_id'])]
#[ORM\UniqueConstraint(name: 'uq_books_isbn', columns: ['isbn'])]
class Book
{
    #[ORM\Id]
    #[ORM\GeneratedValue(strategy: 'IDENTITY')]
    #[ORM\Column(name: 'id', type: Types::BIGINT)]
    private ?int $id = null;

    #[ORM\Column(name: 'isbn', type: Types::STRING, length: 13)]
    private string $isbn;

    #[ORM\Column(name: 'title', type: Types::TEXT)]
    private string $title;

    #[ORM\Column(name: 'price', type: Types::DECIMAL, precision: 8, scale: 2)]
    private string $price;

    #[ORM\Column(name: 'published_on', type: Types::DATE_IMMUTABLE)]
    private \DateTimeImmutable $publishedOn;

    #[ORM\Column(name: 'genre', type: Types::STRING, length: 20, enumType: Genre::class)]
    private Genre $genre;

    #[ORM\Column(name: 'shelf_room', type: Types::TEXT)]
    private string $shelfRoom;

    #[ORM\Column(name: 'shelf_row', type: Types::INTEGER, nullable: true)]
    private ?int $shelfRow = null;

    #[ORM\ManyToOne(targetEntity: Author::class, inversedBy: 'books')]
    #[ORM\JoinColumn(name: 'author_id', referencedColumnName: 'id', nullable: false)]
    private Author $author;

    #[ORM\ManyToMany(targetEntity: Tag::class)]
    #[ORM\JoinTable(name: 'books_tags')]
    #[ORM\JoinColumn(name: 'book_id', referencedColumnName: 'id', onDelete: 'CASCADE')]
    #[ORM\InverseJoinColumn(name: 'tag_code', referencedColumnName: 'code', onDelete: 'CASCADE')]
    private Collection $tags;

    public function __construct()
    {
        $this->tags = new ArrayCollection();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function setId(?int $id): static
    {
        $this->id = $id;

        return $this;
    }

    public function getIsbn(): string
    {
        return $this->isbn;
    }

    public function setIsbn(string $isbn): static
    {
        $this->isbn = $isbn;

        return $this;
    }

    public function getTitle(): string
    {
        return $this->title;
    }

    public function setTitle(string $title): static
    {
        $this->title = $title;

        return $this;
    }

    public function getPrice(): string
    {
        return $this->price;
    }

    public function setPrice(string $price): static
    {
        $this->price = $price;

        return $this;
    }

    public function getPublishedOn(): \DateTimeImmutable
    {
        return $this->publishedOn;
    }

    public function setPublishedOn(\DateTimeImmutable $publishedOn): static
    {
        $this->publishedOn = $publishedOn;

        return $this;
    }

    public function getGenre(): Genre
    {
        return $this->genre;
    }

    public function setGenre(Genre $genre): static
    {
        $this->genre = $genre;

        return $this;
    }

    public function getShelfRoom(): string
    {
        return $this->shelfRoom;
    }

    public function setShelfRoom(string $shelfRoom): static
    {
        $this->shelfRoom = $shelfRoom;

        return $this;
    }

    public function getShelfRow(): ?int
    {
        return $this->shelfRow;
    }

    public function setShelfRow(?int $shelfRow): static
    {
        $this->shelfRow = $shelfRow;

        return $this;
    }

    public function getAuthor(): Author
    {
        return $this->author;
    }

    public function setAuthor(Author $author): static
    {
        $this->author = $author;

        return $this;
    }

    public function getTags(): Collection
    {
        return $this->tags;
    }
}
