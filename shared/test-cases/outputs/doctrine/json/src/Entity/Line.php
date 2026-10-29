<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/** Entity written by Model2DB from Invoice. Review it before using it. */
#[ORM\Entity]
#[ORM\Table(name: 'lines')]
#[ORM\Index(name: 'ix_lines_invoice_id', columns: ['invoice_id'])]
class Line
{
    #[ORM\Id]
    #[ORM\GeneratedValue(strategy: 'IDENTITY')]
    #[ORM\Column(name: 'id', type: Types::BIGINT)]
    private ?int $id = null;

    #[ORM\Column(name: 'description', type: Types::TEXT)]
    private string $description;

    #[ORM\Column(name: 'qty', type: Types::INTEGER)]
    private int $qty;

    #[ORM\Column(name: 'unit_price', type: Types::FLOAT)]
    private float $unitPrice;

    #[ORM\Column(name: 'tax_rate', type: Types::FLOAT)]
    private float $taxRate;

    #[ORM\ManyToOne(targetEntity: Invoice::class, inversedBy: 'lines')]
    #[ORM\JoinColumn(name: 'invoice_id', referencedColumnName: 'invoice_id', nullable: false, onDelete: 'CASCADE')]
    private Invoice $invoice;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function setId(?int $id): static
    {
        $this->id = $id;

        return $this;
    }

    public function getDescription(): string
    {
        return $this->description;
    }

    public function setDescription(string $description): static
    {
        $this->description = $description;

        return $this;
    }

    public function getQty(): int
    {
        return $this->qty;
    }

    public function setQty(int $qty): static
    {
        $this->qty = $qty;

        return $this;
    }

    public function getUnitPrice(): float
    {
        return $this->unitPrice;
    }

    public function setUnitPrice(float $unitPrice): static
    {
        $this->unitPrice = $unitPrice;

        return $this;
    }

    public function getTaxRate(): float
    {
        return $this->taxRate;
    }

    public function setTaxRate(float $taxRate): static
    {
        $this->taxRate = $taxRate;

        return $this;
    }

    public function getInvoice(): Invoice
    {
        return $this->invoice;
    }

    public function setInvoice(Invoice $invoice): static
    {
        $this->invoice = $invoice;

        return $this;
    }
}
