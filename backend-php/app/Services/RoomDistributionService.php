<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class RoomDistributionService
{
    /**
     * Distribute total students across the given rooms intelligently.
     * Fills rooms up to their capacity until all students are distributed.
     * 
     * @param int $totalStudents
     * @param array $roomNames array of room names
     * @return array [ 'room_name' => assigned_count ]
     */
    public function distributeStudents(int $totalStudents, array $roomNames): array
    {
        if (empty($roomNames) || $totalStudents <= 0) {
            return [];
        }

        // Fetch capacities for the selected rooms
        $roomsInfo = DB::table('rooms')
            ->whereIn('room_name', $roomNames)
            ->get()
            ->keyBy('room_name');

        $distribution = [];
        $remainingStudents = $totalStudents;

        // Sort rooms by capacity descending to fill larger rooms first
        $sortedRooms = collect($roomNames)->map(function ($name) use ($roomsInfo) {
            return [
                'name' => $name,
                'capacity' => $roomsInfo->has($name) ? (int)$roomsInfo->get($name)->capacity : 0
            ];
        })->sortByDesc('capacity')->values()->all();

        foreach ($sortedRooms as $room) {
            if ($remainingStudents <= 0) {
                $distribution[$room['name']] = 0;
                continue;
            }

            $assign = min($remainingStudents, $room['capacity']);
            $distribution[$room['name']] = $assign;
            $remainingStudents -= $assign;
        }

        // If there are still remaining students (e.g. overcapacity), add them to the last room
        // or distribute evenly. The conflict service should block overcapacity anyway.
        if ($remainingStudents > 0) {
            $lastRoom = end($sortedRooms)['name'];
            $distribution[$lastRoom] += $remainingStudents;
        }

        return $distribution;
    }
}
