<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/** Entity written by Model2DB from Order. Review it before using it. */
#[ORM\Entity]
#[ORM\Table(name: 'customers')]
class Customer
{
    #[ORM\Id]
    #[ORM\Column(name: 'id', type: Types::BIGINT)]
    private int $id;

    #[ORM\Column(name: 'email', type: Types::TEXT)]
    private string $email;

    #[ORM\Column(name: 'full_name', type: Types::TEXT)]
    private string $fullName;

    #[ORM\Column(name: 'phone', type: Types::TEXT, nullable: true)]
    private ?string $phone = null;

    #[ORM\Column(name: 'created_at', type: Types::DATETIMETZ_IMMUTABLE)]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(name: 'shipping_address_street', type: Types::TEXT)]
    private string $shippingAddressStreet;

    #[ORM\Column(name: 'shipping_address_city', type: Types::TEXT)]
    private string $shippingAddressCity;

    #[ORM\Column(name: 'shipping_address_postal_code', type: Types::TEXT)]
    private string $shippingAddressPostalCode;

    #[ORM\Column(name: 'shipping_address_country', type: Types::TEXT)]
    private string $shippingAddressCountry;

    public function getId(): int
    {
        return $this->id;
    }

    public function setId(int $id): static
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

    public function getFullName(): string
    {
        return $this->fullName;
    }

    public function setFullName(string $fullName): static
    {
        $this->fullName = $fullName;

        return $this;
    }

    public function getPhone(): ?string
    {
        return $this->phone;
    }

    public function setPhone(?string $phone): static
    {
        $this->phone = $phone;

        return $this;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function setCreatedAt(\DateTimeImmutable $createdAt): static
    {
        $this->createdAt = $createdAt;

        return $this;
    }

    public function getShippingAddressStreet(): string
    {
        return $this->shippingAddressStreet;
    }

    public function setShippingAddressStreet(string $shippingAddressStreet): static
    {
        $this->shippingAddressStreet = $shippingAddressStreet;

        return $this;
    }

    public function getShippingAddressCity(): string
    {
        return $this->shippingAddressCity;
    }

    public function setShippingAddressCity(string $shippingAddressCity): static
    {
        $this->shippingAddressCity = $shippingAddressCity;

        return $this;
    }

    public function getShippingAddressPostalCode(): string
    {
        return $this->shippingAddressPostalCode;
    }

    public function setShippingAddressPostalCode(string $shippingAddressPostalCode): static
    {
        $this->shippingAddressPostalCode = $shippingAddressPostalCode;

        return $this;
    }

    public function getShippingAddressCountry(): string
    {
        return $this->shippingAddressCountry;
    }

    public function setShippingAddressCountry(string $shippingAddressCountry): static
    {
        $this->shippingAddressCountry = $shippingAddressCountry;

        return $this;
    }
}
