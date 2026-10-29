<?php

namespace App\Enum;

enum OrderStatus: string
{
    case Draft = 'draft';
    case Paid = 'paid';
    case Shipped = 'shipped';
    case Cancelled = 'cancelled';
}
