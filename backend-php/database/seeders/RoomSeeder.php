<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class RoomSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $rooms = [
            ['room_name' => '2101', 'faculty' => 'library', 'room_type' => 'lab', 'capacity' => 26, 'vlan_id' => 153, 'subnet_pattern' => '172.16.153.x', 'is_active' => 1],
            ['room_name' => '2102', 'faculty' => 'library', 'room_type' => 'lab', 'capacity' => 26, 'vlan_id' => 154, 'subnet_pattern' => '172.16.154.x', 'is_active' => 1],
            ['room_name' => '2103', 'faculty' => 'library', 'room_type' => 'lab', 'capacity' => 26, 'vlan_id' => 155, 'subnet_pattern' => '172.16.155.x', 'is_active' => 1],
            ['room_name' => '2104', 'faculty' => 'library', 'room_type' => 'lab', 'capacity' => 26, 'vlan_id' => 156, 'subnet_pattern' => '172.16.156.x', 'is_active' => 1],
            ['room_name' => '2105', 'faculty' => 'library', 'room_type' => 'lab', 'capacity' => 26, 'vlan_id' => 157, 'subnet_pattern' => '172.16.157.x', 'is_active' => 1],
            ['room_name' => '2106', 'faculty' => 'library', 'room_type' => 'lab', 'capacity' => 26, 'vlan_id' => 158, 'subnet_pattern' => '172.16.158.x', 'is_active' => 1],
            ['room_name' => '2107', 'faculty' => 'library', 'room_type' => 'lab', 'capacity' => 36, 'vlan_id' => 144, 'subnet_pattern' => '172.16.144.x', 'is_active' => 1, 'notes' => null],
            // IT Labs
            ['room_name' => '7416', 'faculty' => 'it', 'room_type' => 'lab', 'capacity' => 24, 'vlan_id' => null, 'subnet_pattern' => null, 'is_active' => 1, 'notes' => 'خارج شبكة الجامعة'],
            ['room_name' => '7417', 'faculty' => 'it', 'room_type' => 'lab', 'capacity' => 20, 'vlan_id' => 136, 'subnet_pattern' => '172.16.136.x', 'is_active' => 1, 'notes' => null],
            ['room_name' => '7418', 'faculty' => 'it', 'room_type' => 'lab', 'capacity' => 18, 'vlan_id' => 138, 'subnet_pattern' => '172.16.138.x', 'is_active' => 1, 'notes' => null],
            ['room_name' => '7419', 'faculty' => 'it', 'room_type' => 'lab', 'capacity' => 26, 'vlan_id' => 137, 'subnet_pattern' => '172.16.137.x', 'is_active' => 1, 'notes' => null],
            ['room_name' => '7420', 'faculty' => 'it', 'room_type' => 'lab', 'capacity' => 26, 'vlan_id' => null, 'subnet_pattern' => null, 'is_active' => 1, 'notes' => 'خارج شبكة الجامعة'],
            ['room_name' => '7422', 'faculty' => 'it', 'room_type' => 'lab', 'capacity' => 26, 'vlan_id' => 140, 'subnet_pattern' => '172.16.140.x', 'is_active' => 1, 'notes' => null],
            ['room_name' => '7424', 'faculty' => 'it', 'room_type' => 'lab', 'capacity' => 26, 'vlan_id' => 143, 'subnet_pattern' => '172.16.143.x', 'is_active' => 1, 'notes' => null],
            ['room_name' => '7426', 'faculty' => 'it', 'room_type' => 'lab', 'capacity' => 26, 'vlan_id' => 142, 'subnet_pattern' => '172.16.142.x', 'is_active' => 1, 'notes' => null],
            ['room_name' => '7428', 'faculty' => 'it', 'room_type' => 'lab', 'capacity' => 26, 'vlan_id' => 139, 'subnet_pattern' => '172.16.139.x', 'is_active' => 1, 'notes' => null],
            ['room_name' => '7325', 'faculty' => 'it', 'room_type' => 'lab', 'capacity' => 24, 'vlan_id' => 135, 'subnet_pattern' => '172.16.135.x', 'is_active' => 1, 'notes' => null],
        ];

        foreach ($rooms as $room) {
            DB::table('rooms')->updateOrInsert(
                ['room_name' => $room['room_name'], 'faculty' => $room['faculty']],
                $room
            );
        }
    }
}
