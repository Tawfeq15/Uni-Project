<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;

/**
 * FinalExamLabAssignmentService
 *
 * Assigns labs/rooms to final computerized exams following priority rules:
 *   Priority 1: Library labs (priority_group = 'library')
 *   Priority 2: IT labs     (priority_group = 'it')
 *   Priority 3: Other labs  (priority_group = 'other')
 *
 * IMPORTANT: This service does NOT check parsed_sessions (lecture timetable).
 * During final exams there are no regular lectures, so lecture conflicts are
 * intentionally ignored. Only scheduled_exams are checked for room conflicts.
 *
 * This service is completely isolated from the normal scheduling workflow.
 */
class FinalExamLabAssignmentService
{
    /** Default capacity when a room has none defined */
    private const DEFAULT_CAPACITY = 30;

    /**
     * Assign labs for a list of exam groups.
     *
     * @param  array  $groups   Each group: { group_key, total_students, exam_date, start_time, end_time, rows[] }
     * @param  string $importId For excluding self when re-assigning
     * @return array  Same groups, each with 'assigned_labs', 'assigned_capacity', 'status', 'notes'
     */
    public function assignLabsForGroups(array $groups, ?int $importId = null): array
    {
        $result = [];

        /**
         * In-memory batch occupancy tracker.
         * Prevents double-booking labs within the same assign-labs call.
         *
         * Structure: $batchOccupied[$date][] = [
         *   'lab_name'   => string,
         *   'start_time' => 'HH:MM:SS',
         *   'end_time'   => 'HH:MM:SS',
         * ]
         */
        $batchOccupied = [];

        /**
         * Sort groups within the same time slot:
         *   1. Non-IT courses FIRST  → they claim library labs
         *   2. IT-related courses AFTER → they use IT labs (library already taken)
         *   3. Within each sub-group: bigger student count first
         */
        usort($groups, function ($a, $b) {
            $aKey = ($a['exam_date'] ?? '') . '|' . ($a['start_time'] ?? '') . '|' . ($a['end_time'] ?? '');
            $bKey = ($b['exam_date'] ?? '') . '|' . ($b['start_time'] ?? '') . '|' . ($b['end_time'] ?? '');

            if ($aKey !== $bKey) {
                return $aKey <=> $bKey;
            }

            $aIsIt = $this->isItRelatedCourse($a['course_name'] ?? '', $a['course_code'] ?? '');
            $bIsIt = $this->isItRelatedCourse($b['course_name'] ?? '', $b['course_code'] ?? '');

            if ($aIsIt !== $bIsIt) {
                return $aIsIt ? 1 : -1;  // non-IT (false) sorts before IT (true)
            }

            return ($b['total_students'] ?? 0) <=> ($a['total_students'] ?? 0);
        });

        foreach ($groups as $group) {
            $date      = $group['exam_date']   ?? null;
            $startTime = $group['start_time']  ?? null;
            $endTime   = $group['end_time']    ?? null;
            $required  = (int)($group['total_students'] ?? 0);

            if (!$date || !$startTime || !$endTime || $required <= 0) {
                $group['assigned_labs']     = [];
                $group['assigned_capacity'] = 0;
                $group['status']            = 'needs_review';
                $group['notes']             = 'بيانات الوقت أو عدد الطلبة مفقودة';
                $result[] = $group;
                continue;
            }

            // 1. DB-level availability check (previously confirmed exams)
            $available = $this->findAvailableLabs($date, $startTime, $endTime, $importId);

            // 2. Filter out labs already booked in THIS BATCH for overlapping times
            $available = array_values(array_filter(
                $available,
                fn($lab) => !$this->isLabOccupiedInBatch(
                    $lab['lab_name'], $batchOccupied, $date, $startTime, $endTime
                )
            ));

            if (empty($available)) {
                $group['assigned_labs']     = [];
                $group['assigned_capacity'] = 0;
                $group['status']            = 'needs_review';
                $group['notes']             = 'لا توجد مختبرات متاحة في هذا الوقت';
                $result[] = $group;
                continue;
            }

            // Detect IT-related courses to prefer IT labs for them
            $isItCourse = $this->isItRelatedCourse(
                $group['course_name'] ?? '',
                $group['course_code'] ?? ''
            );

            [$selected, $notes] = $this->recommendLabCombination($available, $required, $isItCourse);

            $totalCap = array_sum(array_column($selected, 'capacity'));

            $group['assigned_labs']     = $selected;
            $group['assigned_capacity'] = $totalCap;

            if ($totalCap >= $required) {
                $group['status'] = 'assigned';
                $group['notes']  = $notes ?: 'تم توزيع المختبرات بنجاح';
            } else {
                $group['status'] = 'needs_review';
                $shortage        = $required - $totalCap;
                $group['notes']  = "السعة المتاحة غير كافية بـ {$shortage} طالب";
            }

            // 3. Register assigned labs in the batch tracker
            foreach ($selected as $lab) {
                $batchOccupied[$date][] = [
                    'lab_name'   => $lab['lab_name'],
                    'start_time' => $startTime,
                    'end_time'   => $endTime,
                ];
            }

            $result[] = $group;
        }

        return $result;
    }

    /**
     * Check if a lab is already occupied in the current in-memory batch
     * for a time window that overlaps with the given start/end.
     */
    private function isLabOccupiedInBatch(
        string $labName,
        array  $batchOccupied,
        string $date,
        string $startTime,
        string $endTime
    ): bool {
        if (!isset($batchOccupied[$date])) {
            return false;
        }

        $newStart = $this->parseTime($startTime);
        $newEnd   = $this->parseTime($endTime);

        foreach ($batchOccupied[$date] as $entry) {
            if ($entry['lab_name'] !== $labName) {
                continue;
            }
            $entryStart = $this->parseTime($entry['start_time']);
            $entryEnd   = $this->parseTime($entry['end_time']);

            // Strict overlap: touching boundaries are NOT conflicts
            if ($newStart < $entryEnd && $newEnd > $entryStart) {
                return true;
            }
        }

        return false;
    }

    /**
     * Find all labs available at the given date/time window.
     *
     * Checks ONLY scheduled_exams for room occupation.
     * Does NOT check parsed_sessions (lecture timetable) — by design.
     *
     * @param  string $date       YYYY-MM-DD
     * @param  string $startTime  HH:MM:SS
     * @param  string $endTime    HH:MM:SS
     * @param  int|null $importId Exclude rows from this import (for re-assignment)
     */
    public function findAvailableLabs(
        string $date,
        string $startTime,
        string $endTime,
        ?int   $importId = null
    ): array {
        // 1. Fetch all active rooms/labs
        $allRooms = DB::table('rooms')
            ->where('is_active', 1)
            ->get();

        if ($allRooms->isEmpty()) {
            return [];
        }

        // 2. Find rooms occupied by existing scheduled exams at this date/time
        //    Exclude exams from THIS import (so re-assignment doesn't self-conflict)
        $occupiedRooms = $this->getOccupiedRoomNames($date, $startTime, $endTime, $importId);

        $blocked = array_unique($occupiedRooms);

        // 4. Build available list, inferring priority_group if not set
        $available = [];
        foreach ($allRooms as $room) {
            if (in_array($room->room_name, $blocked)) {
                continue; // This room is occupied
            }

            $capacity = (int)($room->capacity ?? 0);
            if ($capacity === 0) {
                $capacity = self::DEFAULT_CAPACITY;
            }

            $priorityGroup = $room->priority_group ?? $this->inferPriorityGroup($room);
            $priorityOrder = (int)($room->priority_order ?? $this->inferPriorityOrder($priorityGroup));

            $available[] = [
                'lab_name'       => $room->room_name,
                'room_id'        => $room->id,
                'capacity'       => $capacity,
                'priority_group' => $priorityGroup,
                'priority_order' => $priorityOrder,
                'faculty'        => $room->faculty ?? null,
                'building'       => $room->building ?? null,
                'room_type'      => $room->room_type ?? null,
                'has_default_cap' => ($room->capacity ?? 0) == 0,
            ];
        }

        // Sort: priority_order ASC → capacity DESC → lab_name natural ASC (tiebreaker)
        // The natural-name tiebreaker guarantees sequential assignment:
        // 2101 → 2102 → 2103 → ... and never skips to 2104 when 2103 is free.
        usort($available, function ($a, $b) {
            if ($a['priority_order'] !== $b['priority_order']) {
                return $a['priority_order'] <=> $b['priority_order'];
            }
            if ($a['capacity'] !== $b['capacity']) {
                return $b['capacity'] <=> $a['capacity'];   // bigger capacity first
            }
            return strnatcmp($a['lab_name'], $b['lab_name']); // 2101 < 2102 < 2103 ...
        });

        return $available;
    }

    /**
     * Given available labs and required student count, pick the best combination
     * following the priority order: library → it → other.
     *
     * Returns [selected_labs[], notes_string]
     */
    /**
     * Detect if a course is IT/CS-related from its name or code.
     * IT courses are routed to IT labs first; non-IT courses use library first.
     */
    private function isItRelatedCourse(string $courseName, string $courseCode = ''): bool
    {
        static $keywords = [
            'برمجة', 'خوارزم', 'حاسوب', 'حاسب', 'شبكات', 'تصميم مواقع', 'قواعد بيانات',
            'ذكاء اصطناعي', 'تعلم آلي', 'أمن معلومات', 'أمن الحاسوب', 'أمن المعلومات',
            'تفاعل الانسان', 'تفاعل الإنسان', 'نظام تشغيل', 'أنظمة تشغيل',
            'مرئية', 'الوحدة المرئية', 'لغة برمجة', 'لغات برمجة',
            'تقنية معلومات', 'معلوماتية', 'حماية', 'تشفير', 'هندسة برمجيات',
            'الانترنت', 'انترنت الاشياء', 'تطبيقات', 'تطوير تطبيقات',
            'اكسل', 'excel', 'programming', 'algorithm', 'network', 'database',
            'web design', 'software', 'operating system', 'cyber', 'computer',
            'visual', 'interface', 'it ', 'c++', 'java', 'python',
        ];

        $name = mb_strtolower(trim($courseName));
        $code = mb_strtolower(trim($courseCode));

        foreach ($keywords as $kw) {
            $kw = mb_strtolower($kw);
            if (str_contains($name, $kw) || str_contains($code, $kw)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Pick the best lab combination for an exam group.
     *
     * Priority logic for NON-IT courses:
     *   1. Library alone   — if libCap ≥ required
     *   2. IT alone        — if itCap ≥ required
     *   3. Library + IT    — combined
     *   4. Other alone     — if otherCap ≥ required
     *   5. Mix all         — last resort
     *
     * Priority logic for IT-related courses (swapped):
     *   1. IT alone        — if itCap ≥ required
     *   2. Library alone   — if libCap ≥ required  (fallback)
     *   3. IT + Library    — combined
     *   4. Other alone
     *   5. Mix all
     *
     * Returns [selected_labs[], notes_string]
     */
    public function recommendLabCombination(array $available, int $studentCount, bool $isItCourse = false): array
    {
        $library = array_values(array_filter($available, fn($r) => $r['priority_group'] === 'library'));
        $it      = array_values(array_filter($available, fn($r) => $r['priority_group'] === 'it'));
        $other   = array_values(array_filter($available, fn($r) => $r['priority_group'] === 'other'));

        $libCap   = array_sum(array_column($library, 'capacity'));
        $itCap    = array_sum(array_column($it,      'capacity'));
        $otherCap = array_sum(array_column($other,   'capacity'));

        // Determine first/second preference pools based on course type
        if ($isItCourse) {
            $first      = $it;      $firstCap  = $itCap;   $firstName = 'IT';
            $second     = $library; $secondCap = $libCap;  $secondName = 'المكتبة';
        } else {
            $first      = $library; $firstCap  = $libCap;  $firstName = 'المكتبة';
            $second     = $it;      $secondCap = $itCap;   $secondName = 'IT';
        }

        // ── Attempt 1: Preferred group alone ─────────────────────────────
        if ($firstCap >= $studentCount) {
            [$selected] = $this->fillFromPool([], $studentCount, $first);
            return [$selected, "تم التوزيع بمختبرات {$firstName} فقط ✅"];
        }

        // ── Attempt 2: Secondary group alone ─────────────────────────────
        if ($secondCap >= $studentCount) {
            [$selected] = $this->fillFromPool([], $studentCount, $second);
            return [$selected, "تم التوزيع بمختبرات {$secondName} فقط ✅"];
        }

        // ── Attempt 3: First + Second combined ───────────────────────────
        // (Library+IT or IT+Library — avoids using "other" labs as much as possible)
        if (($firstCap + $secondCap) >= $studentCount) {
            $selected = []; $remaining = $studentCount;
            [$selected, $remaining] = $this->fillFromPool($selected, $remaining, $first);
            [$selected, $remaining] = $this->fillFromPool($selected, $remaining, $second);
            return [$selected, "تم التوزيع بمختبرات {$firstName} + {$secondName} (مجمعة) ✅"];
        }

        // ── Attempt 4: Other labs alone ───────────────────────────────────
        if ($otherCap >= $studentCount) {
            [$selected] = $this->fillFromPool([], $studentCount, $other);
            return [$selected, '⚠️ تم التوزيع بمختبرات الكليات الأخرى فقط (مكتبة+IT غير كافية)'];
        }

        // ── Attempt 5: Mix all — last resort ─────────────────────────────
        $notes     = ['⚠️ تم استخدام مختبرات مختلطة (السعة الكلية غير كافية)'];
        $selected  = [];
        $remaining = $studentCount;

        foreach ([$first, $second, $other] as $pool) {
            if ($remaining <= 0 || empty($pool)) continue;
            [$selected, $remaining] = $this->fillFromPool($selected, $remaining, $pool);
        }

        return [$selected, implode(' | ', $notes)];
    }


    /**
     * Fill students from a lab pool.
     *
     * Strategy — "Best Fit Single" before "Greedy Multi":
     *   1. If ANY single lab in the pool can cover all remaining students,
     *      pick the SMALLEST sufficient one (minimize wasted seats).
     *   2. Otherwise fall back to greedy: take labs in order until enough.
     *
     * This prevents assigning 2 labs (e.g. 2105+2106 = 52 seats) when a
     * single lab (e.g. 2107 = 36 seats) already fits 33 students.
     *
     * Returns [updated_selected[], updated_remaining]
     */
    private function fillFromPool(array $selected, int $remaining, array $pool): array
    {
        if ($remaining <= 0 || empty($pool)) {
            return [$selected, $remaining];
        }

        // ── Best-fit single lab ──────────────────────────────────────────
        // Find all labs that can cover the required count alone.
        $sufficient = array_values(array_filter($pool, fn($lab) => $lab['capacity'] >= $remaining));

        if (!empty($sufficient)) {
            // Sort ascending by capacity: pick the tightest fit to save bigger labs
            usort($sufficient, fn($a, $b) => $a['capacity'] <=> $b['capacity']);
            $best       = $sufficient[0];
            $selected[] = $best;
            return [$selected, $remaining - $best['capacity']];
        }

        // ── Greedy multi-lab fill ────────────────────────────────────────
        // No single lab is sufficient; take labs in priority order.
        foreach ($pool as $lab) {
            if ($remaining <= 0) break;
            $selected[] = $lab;
            $remaining -= $lab['capacity'];
        }

        return [$selected, $remaining];
    }

    /**
     * Get room names that are occupied at the given date/time by scheduled_exams.
     * Uses strict overlap: A.start < B.end AND A.end > B.start
     * Touching boundaries are NOT conflicts (e.g. 09:15 end / 09:15 start).
     *
     * @param int|null $excludeImportId  Exclude exams created by this import
     *                                   (prevents self-conflict when re-assigning)
     */
    private function getOccupiedRoomNames(
        string $date,
        string $startTime,
        string $endTime,
        ?int   $excludeImportId = null
    ): array {
        $startMin = $this->parseTime($startTime);
        $endMin   = $this->parseTime($endTime);

        // Check full-day exam blocks first
        $fullDayExams = DB::table('scheduled_exams')
            ->where('exam_date', $date)
            ->where('is_full_day', 1)
            ->where('status', '!=', 'cancelled')
            ->when($excludeImportId, fn($q) => $q->where(function($q2) use ($excludeImportId) {
                $q2->whereNull('import_id')
                   ->orWhere('import_id', '!=', $excludeImportId);
            }))
            ->get();

        $allRoomNames = DB::table('rooms')->pluck('room_name')->toArray();
        $occupied = [];

        foreach ($fullDayExams as $exam) {
            if (($exam->booking_scope ?? '') === 'all_university') {
                // Everything is blocked
                return $allRoomNames;
            }
            $rooms = json_decode($exam->rooms_json ?? '[]', true) ?? [];
            foreach ($rooms as $r) {
                $occupied[] = $r;
            }
        }

        // Check time-overlapping scheduled exams (exclude same import)
        $busyExams = DB::table('scheduled_exams')
            ->where('exam_date', $date)
            ->where('status', '!=', 'cancelled')
            ->where(function ($q) {
                $q->whereNull('is_full_day')->orWhere('is_full_day', 0);
            })
            ->whereNotNull('rooms_json')
            ->when($excludeImportId, fn($q) => $q->where(function($q2) use ($excludeImportId) {
                $q2->whereNull('import_id')
                   ->orWhere('import_id', '!=', $excludeImportId);
            }))
            ->get();

        foreach ($busyExams as $exam) {
            if (!$exam->start_time || !$exam->end_time) {
                continue;
            }
            $exStart = $this->parseTime($exam->start_time);
            $exEnd   = $this->parseTime($exam->end_time);

            // Strict overlap (touching boundaries are not conflicts)
            if ($startMin < $exEnd && $endMin > $exStart) {
                $rooms = json_decode($exam->rooms_json, true) ?? [];
                foreach ($rooms as $r) {
                    $occupied[] = $r;
                }
            }
        }

        // Also check scheduled_exam_rooms for more precise room tracking (exclude same import)
        $busyRoomIds = DB::table('scheduled_exam_rooms as ser')
            ->join('scheduled_exams as se', 'ser.scheduled_exam_id', '=', 'se.id')
            ->where('se.exam_date', $date)
            ->where('se.status', '!=', 'cancelled')
            ->whereNotNull('se.start_time')
            ->whereNotNull('se.end_time')
            ->when($excludeImportId, fn($q) => $q->where(function($q2) use ($excludeImportId) {
                $q2->whereNull('se.import_id')
                   ->orWhere('se.import_id', '!=', $excludeImportId);
            }))
            ->select('ser.room_name', 'se.start_time', 'se.end_time')
            ->get();

        foreach ($busyRoomIds as $row) {
            if (!$row->start_time || !$row->end_time) continue;
            $exStart = $this->parseTime($row->start_time);
            $exEnd   = $this->parseTime($row->end_time);
            if ($startMin < $exEnd && $endMin > $exStart) {
                $occupied[] = $row->room_name;
            }
        }

        return array_unique($occupied);
    }

    /**
     * Get available labs summary for the UI (/available-labs endpoint)
     */
    public function getAvailableLabsSummary(): array
    {
        $rooms = DB::table('rooms')->where('is_active', 1)->get();

        $grouped = ['library' => [], 'it' => [], 'other' => []];

        foreach ($rooms as $room) {
            $pg = $room->priority_group ?? $this->inferPriorityGroup($room);
            if (!isset($grouped[$pg])) {
                $pg = 'other';
            }

            $grouped[$pg][] = [
                'id'             => $room->id,
                'lab_name'       => $room->room_name,
                'capacity'       => (int)($room->capacity ?? self::DEFAULT_CAPACITY),
                'faculty'        => $room->faculty ?? null,
                'building'       => $room->building ?? null,
                'priority_group' => $pg,
                'priority_order' => $room->priority_order ?? $this->inferPriorityOrder($pg),
                'is_active'      => (bool)$room->is_active,
            ];
        }

        return [
            'library' => [
                'labs'           => $grouped['library'],
                'count'          => count($grouped['library']),
                'total_capacity' => array_sum(array_column($grouped['library'], 'capacity')),
            ],
            'it'      => [
                'labs'           => $grouped['it'],
                'count'          => count($grouped['it']),
                'total_capacity' => array_sum(array_column($grouped['it'], 'capacity')),
            ],
            'other'   => [
                'labs'           => $grouped['other'],
                'count'          => count($grouped['other']),
                'total_capacity' => array_sum(array_column($grouped['other'], 'capacity')),
            ],
        ];
    }

    /**
     * Infer priority group from room's faculty field (exact match).
     * Used as fallback when priority_group column is NULL.
     *
     * Exact faculty → group mapping (must match DB faculty values exactly):
     *   'library'  → library
     *   'it'       → it
     *   anything else → other
     */
    public function inferPriorityGroup(object $room): string
    {
        $faculty = mb_strtolower(trim($room->faculty ?? ''));

        // Exact matches first
        if ($faculty === 'library' || $faculty === 'مكتبة') {
            return 'library';
        }
        if ($faculty === 'it' || $faculty === 'information technology') {
            return 'it';
        }

        // Partial match only for library keyword in room name
        $name = mb_strtolower(trim($room->room_name ?? ''));
        if (str_contains($name, 'lib') || str_contains($name, 'مكتبة')) {
            return 'library';
        }

        return 'other';
    }

    private function inferPriorityOrder(string $group): int
    {
        return match($group) {
            'library' => 1,
            'it'      => 2,
            default   => 3,
        };
    }

    /**
     * Parse time string to minutes since midnight for comparison.
     */
    public function parseTime(string $time): int
    {
        // Support HH:MM:SS and HH:MM
        $parts = explode(':', $time);
        return ((int)($parts[0] ?? 0)) * 60 + ((int)($parts[1] ?? 0));
    }
}
