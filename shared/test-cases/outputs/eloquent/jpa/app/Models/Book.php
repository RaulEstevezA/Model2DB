<?php

namespace App\Models;

use App\Enums\Genre;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/** Model written by Model2DB from Author. Review it before using it. */
class Book extends Model
{
    protected $table = 'books';

    protected $primaryKey = 'id';
    public $timestamps = false;

    protected $fillable = ['isbn', 'title', 'price', 'published_on', 'genre', 'author_id', 'shelf_room', 'shelf_row'];

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'price' => 'decimal:2',
            'published_on' => 'immutable_date',
            'genre' => Genre::class,
            'author_id' => 'integer',
            'shelf_row' => 'integer',
        ];
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(Author::class, 'author_id', 'id');
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class, 'books_tags', 'book_id', 'tag_code');
    }
}
