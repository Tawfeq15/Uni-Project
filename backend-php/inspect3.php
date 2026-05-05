<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$avail = app()->make(\App\Services\AvailabilityService::class);
print_r(array_filter($avail->getFreeSlots(['roomType' => 'lab']), fn($s) => $s['room'] === '2101'));
