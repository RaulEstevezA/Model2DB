<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Model written by Model2DB from Invoice. Review it before using it. */
class Line extends Model
{
    protected $table = 'lines';

    protected $primaryKey = 'id';
    public $timestamps = false;

    protected $fillable = ['description', 'qty', 'unit_price', 'tax_rate', 'invoice_id'];

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'qty' => 'integer',
            'unit_price' => 'float',
            'tax_rate' => 'float',
            'invoice_id' => 'integer',
        ];
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'invoice_id', 'invoice_id');
    }
}
