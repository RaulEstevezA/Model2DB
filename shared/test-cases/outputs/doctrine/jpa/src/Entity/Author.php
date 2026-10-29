<?php

namespace App\Entity;

use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/** Entity written by Model2DB from Author. Review it before using it. */
#[ORM\Entity]
#[ORM\Table(name: 'authors')]
#[ORM\UniqueConstraint(name: 'uq_authors_email', columns: ['email'])]
class Author
{
    #[ORM\Id]
    #[ORM\GeneratedValue(strategy: 'IDENTITY')]
    #[ORM\Column(name: 'id', type: Types::BIGINT)]
    private ?int $id = null;

    #[ORM\Column(name: 'name', type: Types::STRING, length: 120)]
    private string $name;

    #[ORM\Column(name: 'email', type: Types::TEXT)]
    private string $email;

    #[ORM\OneToMany(targetEntity: Book::class, mappedBy: 'author')]
    private Collection $books;

    public function __construct()
    {
        $this->books = new ArrayCollection();
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

    public function getName(): string
    {
        return $this->name;
    }

    public function setName(string $name): static
    {
        $this->name = $name;

        return $this;
    }

    public function getEmail(): string
    {
        return $this->email;
    }

    public function setEmail(string $email): static
    {
        $this->email = $email;

        return $this;
    }

    public function getBooks(): Collection
    {
        return $this->books;
    }
}
