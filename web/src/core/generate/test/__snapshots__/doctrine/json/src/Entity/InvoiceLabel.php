<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/** Entity written by Model2DB from Invoice. Review it before using it. */
#[ORM\Entity]
#[ORM\Table(name: 'invoice_labels')]
class InvoiceLabel
{
    #[ORM\Id]
    #[ORM\Column(name: 'position', type: Types::INTEGER)]
    private int $position;

    #[ORM\Column(name: 'value', type: Types::TEXT)]
    private string $value;

    #[ORM\Id]
    #[ORM\ManyToOne(targetEntity: Invoice::class, inversedBy: 'labels')]
    #[ORM\JoinColumn(name: 'invoice_id', referencedColumnName: 'invoice_id', nullable: false, onDelete: 'CASCADE')]
    private Invoice $invoice;

    public function getPosition(): int
    {
        return $this->position;
    }

    public function setPosition(int $position): static
    {
        $this->position = $position;

        return $this;
    }

    public function getValue(): string
    {
        return $this->value;
    }

    public function setValue(string $value): static
    {
        $this->value = $value;

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
