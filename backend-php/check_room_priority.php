<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

$rooms = \Illuminate\Support\Facades\DB::table('rooms')
    ->where('is_active', 1)
    ->orderBy('priority_order')
    ->orderBy('room_name')
    ->get(['room_name', 'faculty', 'capacity', 'priority_group', 'priority_order']);

echo str_pad("القاعة", 10) . str_pad("الكلية", 20) . str_pad("السعة", 8) . str_pad("المجموعة", 12) . "الترتيب\n";
echo str_repeat('-', 60) . "\n";
foreach ($rooms as $r) {
    echo str_pad($r->room_name, 10)
       . str_pad($r->faculty ?? '-', 20)
       . str_pad($r->capacity, 8)
       . str_pad($r->priority_group ?? 'NULL', 12)
       . $r->priority_order . "\n";
}
echo "\nTotal: " . count($rooms) . " active rooms\n";
