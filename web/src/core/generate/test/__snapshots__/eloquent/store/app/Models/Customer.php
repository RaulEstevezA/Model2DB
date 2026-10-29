<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Model written by Model2DB from Order. Review it before using it. */
class Customer extends Model
{
    protected $table = 'customers';

    protected $primaryKey = 'id';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = ['id', 'email', 'full_name', 'phone', 'created_at', 'shipping_address_street', 'shipping_address_city', 'shipping_address_postal_code', 'shipping_address_country'];

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'created_at' => 'immutable_datetime',
        ];
    }
}
