<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$avail = app()->make(\App\Services\AvailabilityService::class);
$slots = array_filter($avail->getFreeSlots(['roomType' => 'lab', 'day' => 'monday']), fn($s) => $s['room'] === '2102');
print_r($slots);
