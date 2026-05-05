<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * RoomAvailabilityService
 *
 * Finds available rooms for a given exam date/time slot.
 * Applies the own-course lecture exception when course_code + selected_sections are provided.
 * Returns available rooms, recommended combinations, and warnings.
 */
class RoomAvailabilityService
{
    public function __construct(
        private SchedulingConflictService $conflictService
    ) {}

    /**
     * Find available rooms for the given exam parameters.
     *
     * @param array $params {
     *   exam_date        : string YYYY-MM-DD
     *   start_time       : string HH:MM
     *   end_time         : string HH:MM
     *   student_count    : int
     *   course_code      : string|null
     *   course_name      : string|null
     *   selected_sections: array
     *   selection_mode   : string  'selected_sections'|'all_sections'
     *   exclude_exam_id  : int|null
     *   faculty          : string|null
     *   room_type        : string|null  'lab'|'room'|null
     * }
     */
    public function getAvailableRooms(array $params): array
    {
        $examDate         = $params['exam_date']         ?? null;
        $startTime        = $params['start_time']        ?? null;
        $endTime          = $params['end_time']          ?? null;
        $studentCount     = (int)($params['student_count'] ?? 0);
        $courseCode       = $params['course_code']       ?? null;
        $courseName       = $params['course_name']       ?? null;
        $selectedSections = $params['selected_sections'] ?? [];
        $selectionMode    = $params['selection_mode']    ?? 'selected_sections';
        $excludeExamId    = $params['exclude_exam_id']   ?? null;
        $faculty          = $params['faculty']           ?? null;
        $roomType         = $params['room_type']         ?? null;

        if (!$examDate || !$startTime || !$endTime) {
            return ['available_rooms' => [], 'recommended_combinations' => [], 'warnings' => []];
        }

        // Calculate day from date
        $dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
        $day = $dayNames[(int)\Carbon\Carbon::parse($examDate)->dayOfWeek] ?? null;

        // 1. Fetch all candidate rooms from DB
        $query = DB::table('rooms');
        if ($faculty) {
            $query->where(function($q) use ($faculty) {
                $q->where('building', $faculty)
                  ->orWhere('faculty', $faculty)
                  ->orWhere('room_type', $faculty);
            });
        }
        if ($roomType) {
            $query->where('room_type', $roomType);
        }
        $allRooms = $query->get()->keyBy('room_name');
        $roomNames = $allRooms->keys()->toArray();

        if (empty($roomNames)) {
            return ['available_rooms' => [], 'recommended_combinations' => [], 'warnings' => []];
        }

        // 2. Find rooms blocked by overlapping scheduled exams
        $startMin = $this->conflictService->parseTime($startTime);
        $endMin   = $this->conflictService->parseTime($endTime);

        $blockedByExam = collect();
        if ($examDate) {
            $busyExams = DB::table('scheduled_exams')
                ->where('exam_date', $examDate)
                ->where('status', '!=', 'cancelled')
                ->when($excludeExamId, fn($q) => $q->where('id', '!=', $excludeExamId))
                ->whereNotNull('rooms_json')
                ->get();

            foreach ($busyExams as $exam) {
                $exStart = $this->conflictService->parseTime($exam->start_time);
                $exEnd   = $this->conflictService->parseTime($exam->end_time);

                // Check for full-day exams
                if ($exam->is_full_day ?? false) {
                    $rooms = json_decode($exam->rooms_json, true) ?? [];
                    foreach ($rooms as $r) {
                        $blockedByExam->put($r, 'scheduled_exam_full_day');
                    }
                    continue;
                }

                if ($startMin < $exEnd && $endMin > $exStart) {
                    $rooms = json_decode($exam->rooms_json, true) ?? [];
                    foreach ($rooms as $r) {
                        $blockedByExam->put($r, 'scheduled_exam');
                    }
                }
            }
        }

        // Also block rooms from full-day exams on the same date
        $fullDayExams = DB::table('scheduled_exams')
            ->where('exam_date', $examDate)
            ->where('is_full_day', 1)
            ->where('status', '!=', 'cancelled')
            ->when($excludeExamId, fn($q) => $q->where('id', '!=', $excludeExamId))
            ->get();

        foreach ($fullDayExams as $exam) {
            if (($exam->booking_scope ?? '') === 'all_university') {
                // All rooms blocked
                foreach ($roomNames as $r) {
                    $blockedByExam->put($r, 'full_day_all_university');
                }
                break;
            }
            $rooms = json_decode($exam->rooms_json ?? '[]', true) ?? [];
            foreach ($rooms as $r) {
                $blockedByExam->put($r, 'full_day_exam');
            }
        }

        // 3. Find rooms blocked by parsed lecture sessions (with own-course exception)
        $blockedByLecture = collect();
        $ownCourseRooms   = collect(); // Available with note (same course lecture)

        if ($day) {
            $sessions = DB::table('parsed_sessions as ps')
                ->join('uploaded_files as uf', 'ps.uploaded_file_id', '=', 'uf.id')
                ->select('ps.*')
                ->whereIn('ps.room', $roomNames)
                ->whereRaw('LOWER(ps.day) = LOWER(?)', [$day])
                ->where('ps.is_valid', 1)
                ->where('uf.is_active', 1)
                ->whereNotNull('ps.start_time')
                ->whereNotNull('ps.end_time')
                ->get();

            foreach ($sessions as $session) {
                $sesStart = $this->conflictService->parseTime($session->start_time);
                $sesEnd   = $this->conflictService->parseTime($session->end_time);

                if (!($startMin < $sesEnd && $endMin > $sesStart)) continue;

                // Apply own-course exception
                $examData = [
                    'course_code'      => $courseCode,
                    'course_name'      => $courseName,
                    'selected_sections'=> $selectedSections,
                    'selection_mode'   => $selectionMode,
                ];
                $ignore = $courseCode
                    ? $this->conflictService->shouldIgnoreOwnCourseLectureConflict($examData, $session)
                    : false;

                if ($ignore === 'ignore') {
                    $ownCourseRooms->put($session->room, 'same_course_section');
                } elseif ($ignore === 'warn') {
                    $ownCourseRooms->put($session->room, 'same_course_warn');
                } else {
                    $blockedByLecture->put($session->room, $session->course_name ?? 'محاضرة أخرى');
                }
            }
        }

        // 4. Classify each room
        $warnings = [];
        $availableRooms = [];

        foreach ($roomNames as $roomName) {
            $roomInfo = $allRooms->get($roomName);
            $capacity = (int)($roomInfo->capacity ?? 0);

            if ($blockedByExam->has($roomName)) {
                continue; // Blocked by exam — not available at all
            }

            if ($blockedByLecture->has($roomName)) {
                continue; // Blocked by different course lecture
            }

            $note = null;
            if ($ownCourseRooms->has($roomName)) {
                $noteType = $ownCourseRooms->get($roomName);
                $note = $noteType === 'same_course_section'
                    ? 'متاحة — محاضرة نفس المادة والشعبة في نفس الوقت'
                    : 'متاحة — محاضرة نفس المادة في نفس الوقت (شعبة غير محددة)';
            }

            $availableRooms[] = [
                'room_name'  => $roomName,
                'capacity'   => $capacity,
                'building'   => $roomInfo->building ?? null,
                'room_type'  => $roomInfo->room_type ?? null,
                'is_available' => true,
                'note'       => $note,
            ];
        }

        // Sort: largest capacity first, then alphabetically
        usort($availableRooms, fn($a, $b) => $b['capacity'] <=> $a['capacity'] ?: strcmp($a['room_name'], $b['room_name']));

        // 5. Generate recommended combinations
        $recommended = [];
        if ($studentCount > 0) {
            $recommended = $this->recommendCombinations($availableRooms, $studentCount);
        }

        // Collect warnings
        foreach ($ownCourseRooms as $room => $type) {
            if (!$blockedByExam->has($room) && !$blockedByLecture->has($room)) {
                $warnings[] = [
                    'room' => $room,
                    'message' => $type === 'same_course_section'
                        ? "القاعة {$room}: متاحة — توجد محاضرة لنفس المادة والشعبة في هذا الوقت (سيُعتبر الامتحان بديلاً عنها)"
                        : "القاعة {$room}: توجد محاضرة لنفس المادة في هذا الوقت — تحقق من الشعب",
                ];
            }
        }

        return [
            'available_rooms'           => $availableRooms,
            'recommended_combinations'  => $recommended,
            'warnings'                  => $warnings,
        ];
    }

    /**
     * Recommend room combinations that cover at least student_count.
     * Sorted by: fewest rooms → least capacity waste.
     */
    private function recommendCombinations(array $rooms, int $studentCount): array
    {
        $combinations = [];
        $n = count($rooms);

        // Greedy approach: build combinations from the largest rooms
        // up to min($n, 4) rooms to keep response manageable
        $maxRoomsPerCombo = min($n, 4);

        for ($size = 1; $size <= $maxRoomsPerCombo; $size++) {
            $combos = $this->combinations($rooms, $size);
            foreach ($combos as $combo) {
                $totalCap = array_sum(array_column($combo, 'capacity'));
                if ($totalCap >= $studentCount) {
                    $waste = $totalCap - $studentCount;
                    $combinations[] = [
                        'rooms'          => array_column($combo, 'room_name'),
                        'total_capacity' => $totalCap,
                        'waste'          => $waste,
                        'room_count'     => $size,
                    ];
                }
            }
            // If we found enough combos of this size, stop looking for larger combos
            if (count($combinations) >= 5) break;
        }

        // Sort by: fewest rooms → least waste
        usort($combinations, fn($a, $b) =>
            $a['room_count'] <=> $b['room_count'] ?: $a['waste'] <=> $b['waste']
        );

        // Return top 5 only
        return array_slice($combinations, 0, 5);
    }

    /**
     * Generate all combinations of size $k from $array.
     * Limits total output to avoid memory issues on large room lists.
     */
    private function combinations(array $array, int $k): array
    {
        $n = count($array);
        if ($k > $n) return [];
        if ($k === $n) return [$array];
        if ($k === 1) return array_map(fn($x) => [$x], $array);

        $result = [];
        for ($i = 0; $i < $n - $k + 1; $i++) {
            $sub = $this->combinations(array_slice($array, $i + 1), $k - 1);
            foreach ($sub as $c) {
                $result[] = array_merge([$array[$i]], $c);
                if (count($result) >= 50) return $result; // safety limit
            }
        }
        return $result;
    }
}
