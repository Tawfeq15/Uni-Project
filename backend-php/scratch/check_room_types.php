<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

$rooms = Illuminate\Support\Facades\DB::table('rooms')
    ->whereIn('room_name', ['2101','2102','2103'])
    ->get();

echo json_encode($rooms, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
