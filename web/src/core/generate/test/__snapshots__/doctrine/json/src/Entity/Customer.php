<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/** Entity written by Model2DB from Invoice. Review it before using it. */
#[ORM\Entity]
#[ORM\Table(name: 'customers')]
class Customer
{
    #[ORM\Id]
    #[ORM\Column(name: 'customer_id', type: Types::INTEGER)]
    private int $customerId;

    #[ORM\Column(name: 'name', type: Types::TEXT)]
    private string $name;

    #[ORM\Column(name: 'email', type: Types::TEXT)]
    private string $email;

    #[ORM\Column(name: 'billing_address_street', type: Types::TEXT)]
    private string $billingAddressStreet;

    #[ORM\Column(name: 'billing_address_city', type: Types::TEXT)]
    private string $billingAddressCity;

    #[ORM\Column(name: 'billing_address_zip_code', type: Types::TEXT)]
    private string $billingAddressZipCode;

    public function getCustomerId(): int
    {
        return $this->customerId;
    }

    public function setCustomerId(int $customerId): static
    {
        $this->customerId = $customerId;

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

    public function getBillingAddressStreet(): string
    {
        return $this->billingAddressStreet;
    }

    public function setBillingAddressStreet(string $billingAddressStreet): static
    {
        $this->billingAddressStreet = $billingAddressStreet;

        return $this;
    }

    public function getBillingAddressCity(): string
    {
        return $this->billingAddressCity;
    }

    public function setBillingAddressCity(string $billingAddressCity): static
    {
        $this->billingAddressCity = $billingAddressCity;

        return $this;
    }

    public function getBillingAddressZipCode(): string
    {
        return $this->billingAddressZipCode;
    }

    public function setBillingAddressZipCode(string $billingAddressZipCode): static
    {
        $this->billingAddressZipCode = $billingAddressZipCode;

        return $this;
    }
}
