<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Model written by Model2DB from Author. Review it before using it. */
class Author extends Model
{
    protected $table = 'authors';

    protected $primaryKey = 'id';
    public $timestamps = false;

    protected $fillable = ['name', 'email'];

    protected function casts(): array
    {
        return [
            'id' => 'integer',
        ];
    }

    public function books(): HasMany
    {
        return $this->hasMany(Book::class, 'author_id', 'id');
    }
}
