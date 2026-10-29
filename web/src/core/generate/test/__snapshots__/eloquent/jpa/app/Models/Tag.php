<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Model written by Model2DB from Author. Review it before using it. */
class Tag extends Model
{
    protected $table = 'tags';

    protected $primaryKey = 'code';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $fillable = ['code', 'label'];
}
