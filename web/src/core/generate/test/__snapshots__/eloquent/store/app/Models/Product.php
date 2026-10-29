<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/** Model written by Model2DB from Order. Review it before using it. */
class Product extends Model
{
    protected $table = 'products';

    protected $primaryKey = 'id';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = ['id', 'sku', 'name', 'price', 'attributes'];

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'price' => 'float',
            'attributes' => 'array',
        ];
    }

    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(Category::class, 'categories_products', 'product_id', 'category_id');
    }
}
