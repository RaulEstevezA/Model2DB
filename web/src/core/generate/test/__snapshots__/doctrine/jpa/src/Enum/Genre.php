<?php

namespace App\Enum;

enum Genre: string
{
    case Fiction = 'FICTION';
    case Essay = 'ESSAY';
    case Poetry = 'POETRY';
    case Science = 'SCIENCE';
}
