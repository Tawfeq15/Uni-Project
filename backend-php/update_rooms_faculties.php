<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

echo "UPDATING ROOMS AND FACULTIES...\n";

// 1. Update 'arts' to 'literature'
$affectedArts = DB::table('rooms')->where('faculty', 'arts')->update(['faculty' => 'literature']);
$affectedSess = DB::table('parsed_sessions')->where('faculty', 'arts')->update(['faculty' => 'literature']);
echo "Updated $affectedArts rooms and $affectedSess sessions from 'arts' to 'literature'.\n";

// 2. Define New Rooms
$newRooms = [
    // Literature (already handled by update, but ensure capacity for 6304)
    ['room_name' => '6304', 'room_type' => 'lab', 'capacity' => 30, 'faculty' => 'literature', 'is_active' => 1],
    ['room_name' => '6320', 'room_type' => 'lab', 'capacity' => 20, 'faculty' => 'literature', 'is_active' => 1],
    ['room_name' => '6202', 'room_type' => 'lab', 'capacity' => 20, 'faculty' => 'literature', 'is_active' => 1],
    
    // Law
    ['room_name' => '3411', 'room_type' => 'lab', 'capacity' => 24, 'faculty' => 'law', 'is_active' => 1],
    
    // Architecture
    ['room_name' => '4313', 'room_type' => 'lab', 'capacity' => 23, 'faculty' => 'architecture', 'is_active' => 1],
    ['room_name' => '4315', 'room_type' => 'lab', 'capacity' => 23, 'faculty' => 'architecture', 'is_active' => 1],
    ['room_name' => '4310', 'room_type' => 'lab', 'capacity' => 23, 'faculty' => 'architecture', 'is_active' => 1],
    ['room_name' => '4210', 'room_type' => 'lab', 'capacity' => 25, 'faculty' => 'architecture', 'is_active' => 1],
    ['room_name' => '4217', 'room_type' => 'lab', 'capacity' => 22, 'faculty' => 'architecture', 'is_active' => 1],
    ['room_name' => '4428', 'room_type' => 'lab', 'capacity' => 21, 'faculty' => 'architecture', 'is_active' => 1],
    ['room_name' => '4121', 'room_type' => 'lab', 'capacity' => 21, 'faculty' => 'architecture', 'is_active' => 1],
];

foreach ($newRooms as $r) {
    DB::table('rooms')->updateOrInsert(
        ['room_name' => $r['room_name']],
        $r
    );
    echo "Upserted room: {$r['room_name']} ({$r['faculty']})\n";
}

echo "\nCOMPLETED.\n";
