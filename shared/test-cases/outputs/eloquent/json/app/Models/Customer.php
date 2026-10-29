<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Model written by Model2DB from Invoice. Review it before using it. */
class Customer extends Model
{
    protected $table = 'customers';

    protected $primaryKey = 'customer_id';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = ['customer_id', 'name', 'email', 'billing_address_street', 'billing_address_city', 'billing_address_zip_code'];

    protected function casts(): array
    {
        return [
            'customer_id' => 'integer',
        ];
    }
}
