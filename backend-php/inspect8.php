<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$occ = app()->make(\App\Services\OccupancyService::class);
print_r($occ->getRoomFreeSlots('2101', 'sunday'));
