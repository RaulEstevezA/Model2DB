<?php

namespace App\Models;

use App\Enums\OrderStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Model written by Model2DB from Order. Review it before using it. */
class Order extends Model
{
    protected $table = 'orders';

    protected $primaryKey = 'id';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = ['id', 'status', 'coupon_code', 'placed_at', 'customer_id'];

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'status' => OrderStatus::class,
            'placed_at' => 'immutable_datetime',
            'customer_id' => 'integer',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id', 'id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(OrderLine::class, 'order_id', 'id');
    }

    public function tags(): HasMany
    {
        return $this->hasMany(OrderTag::class, 'order_id', 'id');
    }
}
