<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Model written by Model2DB from Invoice. Review it before using it. */
class InvoiceLabel extends Model
{
    protected $table = 'invoice_labels';

    protected $primaryKey = null;
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = ['invoice_id', 'position', 'value'];

    protected function casts(): array
    {
        return [
            'invoice_id' => 'integer',
            'position' => 'integer',
        ];
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'invoice_id', 'invoice_id');
    }
}
