<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Model written by Model2DB from User. Review it before using it. */
class Comment extends Model
{
    protected $table = 'comments';

    protected $primaryKey = 'id';
    public $timestamps = false;

    protected $fillable = ['text', 'written_at', 'rating', 'post_id'];

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'written_at' => 'immutable_datetime',
            'rating' => 'integer',
            'post_id' => 'integer',
        ];
    }

    public function post(): BelongsTo
    {
        return $this->belongsTo(Post::class, 'post_id', 'id');
    }
}
