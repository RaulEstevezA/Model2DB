<?php

namespace App\Entity;

use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/** Entity written by Model2DB from Invoice. Review it before using it. */
#[ORM\Entity]
#[ORM\Table(name: 'invoices')]
#[ORM\Index(name: 'ix_invoices_customer_id', columns: ['customer_id'])]
class Invoice
{
    #[ORM\Id]
    #[ORM\Column(name: 'invoice_id', type: Types::INTEGER)]
    private int $invoiceId;

    #[ORM\Column(name: 'number', type: Types::TEXT)]
    private string $number;

    #[ORM\Column(name: 'issued_at', type: Types::DATETIMETZ_IMMUTABLE)]
    private \DateTimeImmutable $issuedAt;

    #[ORM\Column(name: 'currency', type: Types::TEXT)]
    private string $currency;

    #[ORM\Column(name: 'paid', type: Types::BOOLEAN)]
    private bool $paid;

    #[ORM\Column(name: 'notes', type: Types::JSON, nullable: true)]
    private ?array $notes = null;

    #[ORM\ManyToOne(targetEntity: Customer::class)]
    #[ORM\JoinColumn(name: 'customer_id', referencedColumnName: 'customer_id', nullable: false)]
    private Customer $customer;

    #[ORM\OneToMany(targetEntity: Line::class, mappedBy: 'invoice', cascade: ['persist', 'remove'], orphanRemoval: true)]
    private Collection $lines;

    #[ORM\OneToMany(targetEntity: InvoiceLabel::class, mappedBy: 'invoice', cascade: ['persist', 'remove'], orphanRemoval: true)]
    private Collection $labels;

    public function __construct()
    {
        $this->lines = new ArrayCollection();
        $this->labels = new ArrayCollection();
    }

    public function getInvoiceId(): int
    {
        return $this->invoiceId;
    }

    public function setInvoiceId(int $invoiceId): static
    {
        $this->invoiceId = $invoiceId;

        return $this;
    }

    public function getNumber(): string
    {
        return $this->number;
    }

    public function setNumber(string $number): static
    {
        $this->number = $number;

        return $this;
    }

    public function getIssuedAt(): \DateTimeImmutable
    {
        return $this->issuedAt;
    }

    public function setIssuedAt(\DateTimeImmutable $issuedAt): static
    {
        $this->issuedAt = $issuedAt;

        return $this;
    }

    public function getCurrency(): string
    {
        return $this->currency;
    }

    public function setCurrency(string $currency): static
    {
        $this->currency = $currency;

        return $this;
    }

    public function getPaid(): bool
    {
        return $this->paid;
    }

    public function setPaid(bool $paid): static
    {
        $this->paid = $paid;

        return $this;
    }

    public function getNotes(): ?array
    {
        return $this->notes;
    }

    public function setNotes(?array $notes): static
    {
        $this->notes = $notes;

        return $this;
    }

    public function getCustomer(): Customer
    {
        return $this->customer;
    }

    public function setCustomer(Customer $customer): static
    {
        $this->customer = $customer;

        return $this;
    }

    public function getLines(): Collection
    {
        return $this->lines;
    }

    public function getLabels(): Collection
    {
        return $this->labels;
    }
}
