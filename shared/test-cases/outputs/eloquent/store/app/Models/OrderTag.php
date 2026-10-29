<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Model written by Model2DB from Order. Review it before using it. */
class OrderTag extends Model
{
    protected $table = 'order_tags';

    protected $primaryKey = null;
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = ['order_id', 'position', 'value'];

    protected function casts(): array
    {
        return [
            'order_id' => 'integer',
            'position' => 'integer',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id', 'id');
    }
}
