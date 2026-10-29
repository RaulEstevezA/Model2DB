<?php

namespace App\Entity;

use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/** Entity written by Model2DB from User. Review it before using it. */
#[ORM\Entity]
#[ORM\Table(name: 'users')]
#[ORM\UniqueConstraint(name: 'uq_users_email', columns: ['email'])]
class User
{
    #[ORM\Id]
    #[ORM\Column(name: 'id', type: Types::TEXT)]
    private string $id;

    #[ORM\Column(name: 'email', type: Types::TEXT)]
    private string $email;

    #[ORM\Column(name: 'name', type: Types::TEXT, nullable: true)]
    private ?string $name = null;

    #[ORM\Column(name: 'created_at', type: Types::DATETIMETZ_IMMUTABLE, options: ['default' => 'CURRENT_TIMESTAMP'])]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column(name: 'profile_bio', type: Types::TEXT, nullable: true)]
    private ?string $profileBio = null;

    #[ORM\Column(name: 'profile_website', type: Types::TEXT, nullable: true)]
    private ?string $profileWebsite = null;

    #[ORM\OneToMany(targetEntity: Post::class, mappedBy: 'author')]
    private Collection $posts;

    public function __construct()
    {
        $this->posts = new ArrayCollection();
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function setId(string $id): static
    {
        $this->id = $id;

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

    public function getName(): ?string
    {
        return $this->name;
    }

    public function setName(?string $name): static
    {
        $this->name = $name;

        return $this;
    }

    public function getCreatedAt(): ?\DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function setCreatedAt(?\DateTimeImmutable $createdAt): static
    {
        $this->createdAt = $createdAt;

        return $this;
    }

    public function getProfileBio(): ?string
    {
        return $this->profileBio;
    }

    public function setProfileBio(?string $profileBio): static
    {
        $this->profileBio = $profileBio;

        return $this;
    }

    public function getProfileWebsite(): ?string
    {
        return $this->profileWebsite;
    }

    public function setProfileWebsite(?string $profileWebsite): static
    {
        $this->profileWebsite = $profileWebsite;

        return $this;
    }

    public function getPosts(): Collection
    {
        return $this->posts;
    }
}
