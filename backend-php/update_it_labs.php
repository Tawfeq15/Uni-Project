<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

$rooms = [
    ['room_name' => '7416', 'capacity' => 24, 'vlan_id' => null, 'subnet_pattern' => null, 'notes' => 'خارج شبكة الجامعة'],
    ['room_name' => '7417', 'capacity' => 20, 'vlan_id' => 136, 'subnet_pattern' => '172.16.136.x', 'notes' => null],
    ['room_name' => '7418', 'capacity' => 18, 'vlan_id' => 138, 'subnet_pattern' => '172.16.138.x', 'notes' => null],
    ['room_name' => '7419', 'capacity' => 26, 'vlan_id' => 137, 'subnet_pattern' => '172.16.137.x', 'notes' => null],
    ['room_name' => '7420', 'capacity' => 26, 'vlan_id' => null, 'subnet_pattern' => null, 'notes' => 'خارج شبكة الجامعة'],
    ['room_name' => '7422', 'capacity' => 26, 'vlan_id' => 140, 'subnet_pattern' => '172.16.140.x', 'notes' => null],
    ['room_name' => '7424', 'capacity' => 26, 'vlan_id' => 143, 'subnet_pattern' => '172.16.143.x', 'notes' => null],
    ['room_name' => '7426', 'capacity' => 26, 'vlan_id' => 142, 'subnet_pattern' => '172.16.142.x', 'notes' => null],
    ['room_name' => '7428', 'capacity' => 26, 'vlan_id' => 139, 'subnet_pattern' => '172.16.139.x', 'notes' => null],
    ['room_name' => '7325', 'capacity' => 24, 'vlan_id' => 135, 'subnet_pattern' => '172.16.135.x', 'notes' => null],
];

foreach ($rooms as $room) {
    DB::table('rooms')
        ->where('room_name', $room['room_name'])
        ->where('faculty', 'it')
        ->update([
            'capacity' => $room['capacity'],
            'vlan_id' => $room['vlan_id'],
            'subnet_pattern' => $room['subnet_pattern'],
            'notes' => $room['notes']
        ]);
}

echo "IT Labs updated successfully.\n";
