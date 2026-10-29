<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Model written by Model2DB from User. Review it before using it. */
class Post extends Model
{
    protected $table = 'posts';

    protected $primaryKey = 'id';
    public $timestamps = false;

    protected $fillable = ['title', 'body', 'published', 'author_id'];

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'published' => 'boolean',
        ];
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id', 'id');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(Comment::class, 'post_id', 'id');
    }

    public function tags(): HasMany
    {
        return $this->hasMany(PostTag::class, 'post_id', 'id');
    }
}
