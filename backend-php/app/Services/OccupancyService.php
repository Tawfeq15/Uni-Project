<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Occupancy Engine
 * Builds a room occupancy map from parsed lecture sessions + scheduled exams.
 */
class OccupancyService
{
    const WORK_START = 480;  // 08:00
    const WORK_END   = 960;  // 16:00

    protected ParserService $parser;

    public function __construct(ParserService $parser)
    {
        $this->parser = $parser;
    }

    public function toMinutes(string $timeStr): int
    {
        return $this->parser->toMinutes($timeStr);
    }

    public function minutesToTime(int $min): string
    {
        return $this->parser->minutesToTime($min);
    }

    /**
     * Get all occupied intervals for a room on a given day.
     * Returns array of ['start' => int, 'end' => int] in minutes.
     */
    /**
     * Get occupied intervals for a room on a given day.
     *
     * @param string      $room      Room name/number.
     * @param string      $day       Day of week (e.g. 'monday').
     * @param string|null $examDate  If provided, also include scheduled_exams for this specific date (Y-m-d).
     *                               Without a date, only the recurring weekly timetable is used.
     */
    public function getOccupiedIntervals(string $room, string $day, ?string $examDate = null, ?int $existingExamId = null): array
    {
        $intervals = [];

        // ── 1. Weekly timetable (parsed_sessions) ────────────────────────────
        $sessions = DB::select("
            SELECT ps.start_time, ps.end_time
            FROM parsed_sessions ps
            JOIN uploaded_files uf ON ps.uploaded_file_id = uf.id
            WHERE LOWER(ps.room) = LOWER(?)
              AND LOWER(ps.day) = LOWER(?)
              AND ps.is_valid = 1
              AND uf.is_active = 1
              AND ps.start_time IS NOT NULL
              AND ps.end_time IS NOT NULL
        ", [$room, $day]);

        foreach ($sessions as $s) {
            $start = $this->toMinutes($s->start_time);
            $end   = $this->toMinutes($s->end_time);
            $actualStart = max($start, self::WORK_START);
            $actualEnd   = min($end, self::WORK_END);
            if ($actualStart < $actualEnd) {
                $intervals[] = ['start' => $actualStart, 'end' => $actualEnd];
            }
        }

        // ── 2. Scheduled exams — only for a specific date ────────────────────
        // Exams are one-off events tied to a specific date, not weekly recurring.
        // We only factor them in when the caller supplies an examDate.
        if ($examDate) {
            $exams = DB::select("
                SELECT se.id, se.start_time, se.end_time, se.rooms_json
                FROM scheduled_exams se
                WHERE se.exam_date = ?
                  AND se.status != 'cancelled'
                  AND se.start_time IS NOT NULL
                  AND se.end_time IS NOT NULL
                  " . ($existingExamId ? "AND se.id != ?" : "") . "
            ", $existingExamId ? [$examDate, $existingExamId] : [$examDate]);

            foreach ($exams as $exam) {
                $rooms = [];
                try { $rooms = json_decode($exam->rooms_json ?? '[]', true) ?? []; } catch (\Throwable $e) {}
                $roomLower = strtolower($room);
                if (in_array($roomLower, array_map('strtolower', $rooms))) {
                    $start = $this->toMinutes($exam->start_time);
                    $end   = $this->toMinutes($exam->end_time);
                    if ($start < $end) $intervals[] = ['start' => $start, 'end' => $end];
                }
            }
        }

        return $this->mergeIntervals($intervals);
    }

    public function mergeIntervals(array $intervals): array
    {
        if (!$intervals) return [];
        usort($intervals, fn($a, $b) => $a['start'] - $b['start']);
        $merged = [$intervals[0]];
        for ($i = 1; $i < count($intervals); $i++) {
            $last = &$merged[count($merged) - 1];
            if ($intervals[$i]['start'] < $last['end']) {
                $last['end'] = max($last['end'], $intervals[$i]['end']);
            } else {
                $merged[] = $intervals[$i];
            }
        }
        return $merged;
    }

    public function computeFreeIntervals(array $occupied): array
    {
        $merged = $this->mergeIntervals($occupied);
        $free   = [];
        $currentStart = self::WORK_START;

        foreach ($merged as $occ) {
            if ($occ['start'] > $currentStart) {
                $free[] = ['start' => $currentStart, 'end' => $occ['start']];
            }
            $currentStart = max($currentStart, $occ['end']);
        }

        if ($currentStart < self::WORK_END) {
            $free[] = ['start' => $currentStart, 'end' => self::WORK_END];
        }

        return $free;
    }

    public function getRoomFreeSlots(string $room, string $day, ?string $examDate = null, ?int $existingExamId = null): array
    {
        $occupied = $this->getOccupiedIntervals($room, $day, $examDate, $existingExamId);
        $free     = $this->computeFreeIntervals($occupied);

        return [
            'occupied' => array_map(fn($i) => [
                'start'    => $this->minutesToTime($i['start']),
                'end'      => $this->minutesToTime($i['end']),
                'duration' => $i['end'] - $i['start'],
            ], $occupied),
            'free' => array_map(fn($i) => [
                'start'    => $this->minutesToTime($i['start']),
                'end'      => $this->minutesToTime($i['end']),
                'duration' => $i['end'] - $i['start'],
            ], $free),
        ];
    }

    /**
     * Get all lecture sessions for a room on a given day WITH full details:
     * lecturer name, course name/code, section, start/end time.
     * Only returns sessions from active IT and Library uploads.
     */
    public function getOccupiedSessionsWithDetails(string $room, string $day): array
    {
        $sessions = DB::select("
            SELECT
                ps.start_time,
                ps.end_time,
                ps.lecturer,
                ps.course_name,
                ps.course_code,
                ps.section,
                ps.activity_type,
                uf.faculty
            FROM parsed_sessions ps
            JOIN uploaded_files uf ON ps.uploaded_file_id = uf.id
            WHERE LOWER(ps.room) = LOWER(?)
              AND LOWER(ps.day)  = LOWER(?)
              AND ps.is_valid = 1
              AND uf.is_active = 1
              AND ps.start_time IS NOT NULL
              AND ps.end_time   IS NOT NULL
              AND ps.start_time != ''
              AND ps.end_time   != ''
            ORDER BY ps.start_time ASC
        ", [$room, $day]);

        $result = [];
        foreach ($sessions as $s) {
            $startMin = $this->toMinutes($s->start_time);
            $endMin   = $this->toMinutes($s->end_time);

            // Only include sessions within working hours
            if ($startMin >= self::WORK_END || $endMin <= self::WORK_START) continue;

            $result[] = [
                'start'       => substr($s->start_time, 0, 5),
                'end'         => substr($s->end_time, 0, 5),
                'lecturer'    => $s->lecturer ?: null,
                'course_name' => $s->course_name ?: null,
                'course_code' => $s->course_code ?: null,
                'section'     => $s->section ?: null,
                'type'        => $s->activity_type ?: 'lecture',
                'faculty'     => $s->faculty,
            ];
        }

        return $result;
    }

    public function isRoomFree(string $room, string $day, int $startMin, int $endMin, ?string $examDate = null, ?int $existingExamId = null): bool
    {
        $occupied = $this->getOccupiedIntervals($room, $day, $examDate, $existingExamId);
        foreach ($occupied as $occ) {
            if ($startMin < $occ['end'] && $endMin > $occ['start']) return false;
        }
        return true;
    }

    public function isLecturerFree(string $lecturer, string $day, int $startMin, int $endMin, ?int $existingExamId = null): bool
    {
        if (!$lecturer) return true;

        $sessions = DB::select("
            SELECT ps.start_time, ps.end_time
            FROM parsed_sessions ps
            JOIN uploaded_files uf ON ps.uploaded_file_id = uf.id
            WHERE LOWER(ps.lecturer) = LOWER(?)
              AND LOWER(ps.day) = LOWER(?)
              AND ps.is_valid = 1
              AND uf.is_active = 1
              AND ps.start_time IS NOT NULL
              AND ps.end_time IS NOT NULL
        ", [$lecturer, $day]);

        foreach ($sessions as $s) {
            $start = $this->toMinutes($s->start_time);
            $end   = $this->toMinutes($s->end_time);
            if ($startMin < $end && $endMin > $start) return false;
        }

        $exams = DB::select("
            SELECT start_time, end_time
            FROM scheduled_exams
            WHERE LOWER(lecturer) = LOWER(?)
              AND LOWER(day) = LOWER(?)
              AND status != 'cancelled'
              " . ($existingExamId ? "AND id != ?" : "") . "
        ", $existingExamId ? [$lecturer, $day, $existingExamId] : [$lecturer, $day]);

        foreach ($exams as $e) {
            $start = $this->toMinutes($e->start_time);
            $end   = $this->toMinutes($e->end_time);
            if ($startMin < $end && $endMin > $start) return false;
        }

        return true;
    }

    public function getAllRooms(?string $faculty = null): array
    {
        $query  = "SELECT r.room_name, r.room_type, r.capacity, r.faculty FROM rooms r 
                   WHERE r.is_active = 1";
        $params = [];
        
        if ($faculty) {
            // If a specific faculty is chosen, show ALL its rooms (even if no lectures uploaded)
            if (strtolower($faculty) === 'it_library') {
                $query .= " AND LOWER(r.faculty) IN ('it', 'library')";
            } else {
                $query .= " AND LOWER(r.faculty) = LOWER(?)";
                $params[] = strtolower($faculty);
            }
        } else {
            // If "All" is chosen, only show rooms for faculties that have ACTIVE uploaded sessions
            // This prevents cluttering the default view with empty labs the user isn't using this semester.
            $query .= " AND r.faculty IN (
                SELECT DISTINCT ps.faculty 
                FROM parsed_sessions ps 
                JOIN uploaded_files uf ON ps.uploaded_file_id = uf.id 
                WHERE uf.is_active = 1
            )";
        }
        
        $rooms = DB::select($query, $params);
        $unique = [];
        foreach ($rooms as $r) {
            // In case of duplicates, keep the one with the highest capacity
            if (!isset($unique[$r->room_name]) || $unique[$r->room_name]->capacity < $r->capacity) {
                $unique[$r->room_name] = $r;
            }
        }
        
        return array_values($unique);
    }
}
