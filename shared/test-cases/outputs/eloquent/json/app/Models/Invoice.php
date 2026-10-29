<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Model written by Model2DB from Invoice. Review it before using it. */
class Invoice extends Model
{
    protected $table = 'invoices';

    protected $primaryKey = 'invoice_id';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = ['invoice_id', 'number', 'issued_at', 'currency', 'paid', 'customer_id', 'notes'];

    protected function casts(): array
    {
        return [
            'invoice_id' => 'integer',
            'issued_at' => 'immutable_datetime',
            'paid' => 'boolean',
            'customer_id' => 'integer',
            'notes' => 'array',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id', 'customer_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(Line::class, 'invoice_id', 'invoice_id');
    }

    public function labels(): HasMany
    {
        return $this->hasMany(InvoiceLabel::class, 'invoice_id', 'invoice_id');
    }
}
