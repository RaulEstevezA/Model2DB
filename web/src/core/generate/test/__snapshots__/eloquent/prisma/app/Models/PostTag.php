<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Model written by Model2DB from User. Review it before using it. */
class PostTag extends Model
{
    protected $table = 'post_tags';

    protected $primaryKey = null;
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = ['post_id', 'position', 'value'];

    protected function casts(): array
    {
        return [
            'post_id' => 'integer',
            'position' => 'integer',
        ];
    }

    public function post(): BelongsTo
    {
        return $this->belongsTo(Post::class, 'post_id', 'id');
    }
}
