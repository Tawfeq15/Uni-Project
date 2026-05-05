<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AvailabilityService;
use App\Services\OccupancyService;
use Illuminate\Http\Request;

class AvailabilityController extends Controller
{
    public function __construct(
        protected AvailabilityService $availability,
        protected OccupancyService    $occupancy,
    ) {}

    /** GET /api/availability/free-slots */
    public function freeSlots(Request $request)
    {
        $slots = $this->availability->getFreeSlots([
            'faculty'     => $request->query('faculty'),
            'day'         => $request->query('day'),
            'duration'    => $request->query('duration') ? (int)$request->query('duration') : null,
            'minCapacity' => $request->query('studentCount') ? (int)$request->query('studentCount') : null,
            'roomType'    => $request->query('roomType'),
            'timeFrom'    => $request->query('timeFrom'),
            'timeTo'      => $request->query('timeTo'),
        ]);

        return response()->json(['slots' => $slots, 'count' => count($slots)]);
    }

    /** GET /api/availability/rooms */
    public function rooms(Request $request)
    {
        $rooms = $this->occupancy->getAllRooms($request->query('faculty'));
        return response()->json(['rooms' => $rooms]);
    }

    /** GET /api/availability/room/{room}/day/{day}?date=YYYY-MM-DD */
    public function roomDay(string $room, string $day, Request $request)
    {
        // Optional: pass a specific exam date to also include scheduled exams for that day
        $examDate = $request->query('date');
        $result = $this->occupancy->getRoomFreeSlots($room, $day, $examDate ?: null);
        return response()->json($result);
    }

    /** GET /api/availability/room/{room}/day/{day}/sessions
     *  Returns full lecture session details: lecturer, course, time — for IT & Library display panel.
     */
    public function roomDaySessions(string $room, string $day)
    {
        $sessions = $this->occupancy->getOccupiedSessionsWithDetails($room, $day);
        return response()->json(['sessions' => $sessions]);
    }

    /** GET /api/availability/active-sessions
     *  Returns lab sessions overlapping with a time window for the given day.
     *  Params: faculty, day, from (default 08:00), to (default 16:00)
     */
    public function activeSessions(Request $request)
    {
        $facultyFilter = $request->query('faculty', 'it_library');

        $now    = now();
        $dayMap = [0 => 'sunday', 1 => 'monday', 2 => 'tuesday', 3 => 'wednesday', 4 => 'thursday', 5 => 'friday', 6 => 'saturday'];

        // Use client-supplied day, or fall back to server day
        $clientDay = $request->query('day');
        $today     = $clientDay ? strtolower($clientDay) : ($dayMap[$now->dayOfWeek] ?? 'sunday');

        // Time window: from=08:00, to=16:00 (full working day)
        $fromTime = $request->query('from', '08:00');
        $toTime   = $request->query('to',   '16:00');

        // Build room-faculty condition based on filter
        // We filter by the ROOM's faculty (rooms table), not the uploaded file's faculty.
        // This prevents rooms from 'mixed' files that belong to other buildings from appearing.
        if ($facultyFilter === 'it_library') {
            $roomFacultyCondition = "AND LOWER(r.faculty) IN ('it', 'library')";
        } elseif ($facultyFilter === 'it') {
            $roomFacultyCondition = "AND LOWER(r.faculty) = 'it'";
        } elseif ($facultyFilter === 'library') {
            $roomFacultyCondition = "AND LOWER(r.faculty) = 'library'";
        } else {
            $roomFacultyCondition = ''; // no filter
        }

        $sessions = \Illuminate\Support\Facades\DB::select("
            SELECT
                ps.room,
                ps.start_time,
                ps.end_time,
                ps.lecturer,
                ps.course_name,
                ps.course_code,
                ps.section,
                ps.activity_type,
                uf.faculty,
                r.capacity,
                r.faculty AS room_faculty
            FROM parsed_sessions ps
            JOIN uploaded_files uf ON ps.uploaded_file_id = uf.id
            INNER JOIN rooms r ON r.room_name = ps.room
            WHERE LOWER(ps.day) = LOWER(?)
              AND ps.is_valid = 1
              AND uf.is_active = 1
              {$roomFacultyCondition}
              AND ps.start_time IS NOT NULL
              AND ps.end_time   IS NOT NULL
              AND ps.start_time != ''
              AND ps.end_time   != ''
              AND LOWER(ps.room) NOT IN ('online', 'اونلاين', 'افتراضي', '')
              AND ps.room IS NOT NULL
              AND TIME(ps.start_time) <  TIME(?)
              AND TIME(ps.end_time)   >  TIME(?)
            ORDER BY ps.room, ps.start_time ASC
        ", [$today, $toTime, $fromTime]);

        return response()->json([
            'sessions' => $sessions,
            'day'      => $today,
            'from'     => $fromTime,
            'to'       => $toTime,
            'count'    => count($sessions),
        ]);
    }

    public function summary(Request $request)
    {
        $faculty    = $request->query('faculty');
        $rooms      = $this->occupancy->getAllRooms($faculty);
        $totalRooms = count(array_filter($rooms, fn($r) => $r->room_type === 'room'));
        $totalLabs  = count(array_filter($rooms, fn($r) => $r->room_type === 'lab'));

        $today     = strtolower(now()->format('l'));
        $todayDate = now()->format('Y-m-d');
        $freeRooms = 0;
        $freeLabs  = 0;

        foreach ($rooms as $room) {
            // Pass today's date so current-day exams are counted in the summary
            $data = $this->occupancy->getRoomFreeSlots($room->room_name, $today, $todayDate);
            if ($data['free']) {
                if ($room->room_type === 'lab') $freeLabs++;
                else $freeRooms++;
            }
        }

        return response()->json([
            'total_rooms' => $totalRooms,
            'total_labs'  => $totalLabs,
            'free_rooms'  => $freeRooms,
            'free_labs'   => $freeLabs,
        ]);
    }
}
