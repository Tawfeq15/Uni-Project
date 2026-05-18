<?php

namespace App\Services;

/**
 * Availability Engine
 * Computes available free time slots for exam scheduling.
 */
class AvailabilityService
{
    const WORK_START = 480;
    const WORK_END   = 960;

    private array $dayPreferences = [
        'sunday'    => ['preferred' => 60, 'alternate' => 90],
        'tuesday'   => ['preferred' => 60, 'alternate' => 90],
        'thursday'  => ['preferred' => 60, 'alternate' => 90],
        'monday'    => ['preferred' => 90, 'alternate' => 60],
        'wednesday' => ['preferred' => 90, 'alternate' => 60],
        'saturday'  => ['preferred' => 60, 'alternate' => 90],
        'friday'    => ['preferred' => 60, 'alternate' => 90],
    ];

    protected OccupancyService $occupancy;

    public function __construct(OccupancyService $occupancy)
    {
        $this->occupancy = $occupancy;
    }

    public function getFreeSlots(array $opts = []): array
    {
        $faculty     = $opts['faculty'] ?? null;
        $day         = $opts['day'] ?? null;
        $duration    = $opts['duration'] ?? null;
        $minCapacity = $opts['minCapacity'] ?? null;
        $roomType    = $opts['roomType'] ?? null;
        $timeFromMin = isset($opts['timeFrom']) && $opts['timeFrom'] ? $this->timeToMinutes($opts['timeFrom']) : null;
        $timeToMin   = isset($opts['timeTo'])   && $opts['timeTo']   ? $this->timeToMinutes($opts['timeTo'])   : null;

        $results = [];
        $rooms   = $this->occupancy->getAllRooms($faculty);
        $days    = $day ? [$day] : ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];

        foreach ($rooms as $room) {
            if ($roomType && $room->room_type !== $roomType) continue;
            if ($minCapacity && $room->capacity < $minCapacity) continue;

            foreach ($days as $d) {
                $data = $this->occupancy->getRoomFreeSlots($room->room_name, $d);
                foreach ($data['free'] as $slot) {
                    if ($duration && $slot['duration'] < $duration) continue;

                    // Apply preferred time-window filter: clamp to the bounds
                    $slotStartMin = $this->timeToMinutes($slot['start']);
                    $slotEndMin   = $this->timeToMinutes($slot['end']);
                    
                    if ($timeFromMin !== null && $slotEndMin   <= $timeFromMin) continue;
                    if ($timeToMin   !== null && $slotStartMin >= $timeToMin)   continue;

                    $actualStart = $timeFromMin !== null ? max($slotStartMin, $timeFromMin) : $slotStartMin;
                    $actualEnd   = $timeToMin   !== null ? min($slotEndMin, $timeToMin)     : $slotEndMin;

                    $actualDuration = $actualEnd - $actualStart;
                    if ($duration && $actualDuration < $duration) continue;

                    $results[] = [
                        'room'             => $room->room_name,
                        'faculty'          => $room->faculty,
                        'room_type'        => $room->room_type,
                        'capacity'         => $room->capacity,
                        'day'              => $d,
                        'available_from'   => $this->occupancy->minutesToTime($actualStart),
                        'available_to'     => $this->occupancy->minutesToTime($actualEnd),
                        'duration_minutes' => $actualDuration,
                        'occupied_before'  => $data['occupied'],
                    ];
                }
            }
        }

        return $results;
    }

    public function suggestExamSlots(array $opts = []): array
    {
        $faculty      = $opts['faculty'] ?? null;
        $day          = $opts['day'] ?? null;
        $duration     = $opts['duration'] ?? null;
        $studentCount = $opts['studentCount'] ?? 0;
        $lecturer     = $opts['lecturer'] ?? null;
        $roomType     = $opts['roomType'] ?? 'room';
        $timeFromMin  = isset($opts['timeFrom']) && $opts['timeFrom'] ? $this->timeToMinutes($opts['timeFrom']) : null;
        $timeToMin    = isset($opts['timeTo'])   && $opts['timeTo']   ? $this->timeToMinutes($opts['timeTo'])   : null;
        $examDate     = $opts['examDate'] ?? null;
        
        $targetTimeFromStr = $opts['targetTimeFrom'] ?? null;
        $targetDateStr     = $opts['targetDate'] ?? null;

        $days = $day ? [$day] : ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
        $targetDuration = $duration ?: $this->getDayPreferredDuration($day);

        // ─────────────────────────────────────────────────────────────────
        // BULK PRE-LOAD: 3 queries total instead of thousands
        // ─────────────────────────────────────────────────────────────────

        // 1. Load all eligible rooms once
        $allRooms = $this->occupancy->getAllRooms($faculty);
        if ($roomType) {
            $allRooms = array_values(array_filter($allRooms, fn($r) => $r->room_type === $roomType));
        }
        if (empty($allRooms)) {
            return ['suggestions' => [], 'rejected' => [['reason' => 'لا توجد قاعات مسجّلة من هذا النوع']]];
        }
        $roomNames = array_column($allRooms, 'room_name');
        $roomMap   = array_column($allRooms, null, 'room_name'); // name → object

        // 2. Bulk-load ALL lecture sessions for the requested days, for all relevant rooms
        $dayPlaceholders = implode(',', array_fill(0, count($days), '?'));
        $roomLower       = array_map('strtolower', $roomNames);
        $roomPlaceholders = implode(',', array_fill(0, count($roomLower), '?'));

        $rawSessions = \Illuminate\Support\Facades\DB::select("
            SELECT LOWER(ps.room) as room_key, LOWER(ps.day) as day_key,
                   ps.start_time, ps.end_time
            FROM parsed_sessions ps
            JOIN uploaded_files uf ON ps.uploaded_file_id = uf.id
            WHERE LOWER(ps.day) IN ({$dayPlaceholders})
              AND LOWER(ps.room) IN ({$roomPlaceholders})
              AND ps.is_valid = 1 AND uf.is_active = 1
              AND ps.start_time IS NOT NULL AND ps.end_time IS NOT NULL
        ", array_merge($days, $roomLower));

        // 3. Bulk-load ALL scheduled exams (only if examDate given, otherwise skip)
        $rawExams = [];
        if ($examDate) {
            $existingExamId = $opts['existingExamId'] ?? null;
            $rawExams = \Illuminate\Support\Facades\DB::select("
                SELECT rooms_json, start_time, end_time
                FROM scheduled_exams
                WHERE exam_date = ? AND status != 'cancelled'
                  AND start_time IS NOT NULL AND end_time IS NOT NULL
                  " . ($existingExamId ? "AND id != ?" : "") . "
            ", $existingExamId ? [$examDate, $existingExamId] : [$examDate]);
        }

        // 4. Lecturer check: bulk-load if needed
        $lecturerBusy = []; // day → [[start, end]]
        if ($lecturer) {
            $lecSessions = \Illuminate\Support\Facades\DB::select("
                SELECT LOWER(ps.day) as day_key, ps.start_time, ps.end_time
                FROM parsed_sessions ps
                JOIN uploaded_files uf ON ps.uploaded_file_id = uf.id
                WHERE LOWER(ps.lecturer) = LOWER(?)
                  AND LOWER(ps.day) IN ({$dayPlaceholders})
                  AND ps.is_valid = 1 AND uf.is_active = 1
                  AND ps.start_time IS NOT NULL AND ps.end_time IS NOT NULL
            ", array_merge([$lecturer], $days));
            foreach ($lecSessions as $s) {
                $lecturerBusy[$s->day_key][] = [
                    $this->occupancy->toMinutes($s->start_time),
                    $this->occupancy->toMinutes($s->end_time),
                ];
            }
        }

        // ─────────────────────────────────────────────────────────────────
        // BUILD IN-MEMORY OCCUPANCY MAP:  room_key => day_key => [[start, end]]
        // ─────────────────────────────────────────────────────────────────
        $occupancyMap = []; // ['room_key']['day_key'] => [[start,end],...]

        foreach ($rawSessions as $s) {
            $start = $this->occupancy->toMinutes($s->start_time);
            $end   = $this->occupancy->toMinutes($s->end_time);
            if ($start >= $end) continue;
            $occupancyMap[$s->room_key][$s->day_key][] = [$start, $end];
        }

        foreach ($rawExams as $exam) {
            try { $examRooms = json_decode($exam->rooms_json ?? '[]', true) ?? []; } catch (\Throwable $e) { $examRooms = []; }
            $start = $this->occupancy->toMinutes($exam->start_time);
            $end   = $this->occupancy->toMinutes($exam->end_time);
            if ($start >= $end) continue;
            foreach ($examRooms as $er) {
                $erKey = strtolower($er);
                // Add to all queried days because the exam is on a specific date, not day-based
                foreach ($days as $d) {
                    $occupancyMap[$erKey][$d][] = [$start, $end];
                }
            }
        }

        // Helper: check if [startMin, endMin] is free for a room on a day
        $isRoomFreeLocal = function(string $roomName, string $day, int $startMin, int $endMin) use (&$occupancyMap): bool {
            $key = strtolower($roomName);
            $intervals = $occupancyMap[$key][$day] ?? [];
            foreach ($intervals as [$s, $e]) {
                if ($startMin < $e && $endMin > $s) return false;
            }
            return true;
        };

        $isLecturerFreeLocal = function(string $day, int $startMin, int $endMin) use (&$lecturerBusy, $lecturer): bool {
            if (!$lecturer) return true;
            foreach ($lecturerBusy[$day] ?? [] as [$s, $e]) {
                if ($startMin < $e && $endMin > $s) return false;
            }
            return true;
        };

        // ─────────────────────────────────────────────────────────────────
        // GENERATE SUGGESTIONS using in-memory checks (no more DB queries)
        // ─────────────────────────────────────────────────────────────────
        $suggestions = [];
        $rejected    = [];
        $seen        = [];

        foreach ($days as $d) {
            $preferred = $this->dayPreferences[$d]['preferred'] ?? 60;
            $alternate = $this->dayPreferences[$d]['alternate'] ?? 90;
            $durations = array_unique(array_filter([$targetDuration, $preferred, $alternate]));

            foreach ($durations as $dur) {
                $slots = $this->generateTimeSlots($dur);
                foreach ($slots as $slot) {
                    if ($timeFromMin !== null && $slot['start'] < $timeFromMin) continue;
                    if ($timeToMin   !== null && $slot['end']   > $timeToMin)   continue;
                    if ($slot['start'] < self::WORK_START || $slot['end'] > self::WORK_END) continue;

                    // Lecturer check
                    if (!$isLecturerFreeLocal($d, $slot['start'], $slot['end'])) {
                        $rejected[] = ['day' => $d, 'slot' => $slot, 'reason' => 'تعارض في جدول المحاضر'];
                        continue;
                    }

                    // Find available rooms for this slot (in-memory)
                    $available = [];
                    foreach ($allRooms as $r) {
                        if ($isRoomFreeLocal($r->room_name, $d, $slot['start'], $slot['end'])) {
                            $available[] = $r;
                        }
                    }
                    usort($available, fn($a, $b) => $b->capacity - $a->capacity);

                    if (empty($available)) {
                        $rejected[] = ['day' => $d, 'slot' => $slot, 'reason' => 'لا توجد قاعات متاحة في هذا الوقت'];
                        continue;
                    }

                    $needed   = (int)$studentCount;
                    $startStr = $this->occupancy->minutesToTime($slot['start']);
                    $endStr   = $this->occupancy->minutesToTime($slot['end']);
                    $nextDate = \Carbon\Carbon::parse('next ' . $d)->format('Y-m-d');

                    // --- Single-room suggestions ---
                    foreach ($available as $r) {
                        if ($needed > 0 && $r->capacity < $needed) continue;
                        $rank  = ($dur !== $preferred ? 2 : 0);
                        $rank += max(0, ($r->capacity - $needed)) / 10;
                        if ($faculty && strtolower($r->faculty) === strtolower($faculty)) $rank -= 1.5;
                        if ($targetDateStr === ($examDate ?? $nextDate) && $targetTimeFromStr === $startStr) $rank -= 1000;

                        $key = $d . '|' . $slot['start'] . '|' . $r->room_name;
                        if (isset($seen[$key])) continue;
                        $seen[$key] = true;

                        $suggestions[] = [
                            'day'                   => $d,
                            'exam_date'             => $examDate ?? $nextDate,
                            'start_time'            => $startStr,
                            'end_time'              => $endStr,
                            'duration_minutes'      => $dur,
                            'rooms'                 => [$r->room_name],
                            'total_capacity'        => $r->capacity,
                            'room_type'             => $roomType,
                            'rank'                  => $rank,
                            'is_preferred_duration' => $dur === $preferred,
                            'is_combo'              => false,
                        ];
                    }

                    // --- Multi-room combo suggestion (when needed > 0) ---
                    if ($needed > 0 && count($available) >= 2) {
                        $selected = []; $totalCap = 0;
                        foreach ($available as $r) {
                            $selected[] = $r; $totalCap += $r->capacity;
                            if ($totalCap >= $needed && count($selected) >= 2) break;
                        }
                        if (count($selected) >= 2 && $totalCap >= $needed) {
                            $comboKey = $d . '|' . $slot['start'] . '|combo|' . implode(',', array_column($selected, 'room_name'));
                            if (!isset($seen[$comboKey])) {
                                $seen[$comboKey] = true;
                                $rank  = ($dur !== $preferred ? 2 : 0) + count($selected) * 2 + max(0, ($totalCap - $needed)) / 10;
                                $fmatch = count(array_filter($selected, fn($r) => $faculty && strtolower($r->faculty) === strtolower($faculty)));
                                if ($fmatch > 0) $rank -= $fmatch * 1.5;
                                if ($targetDateStr === ($examDate ?? $nextDate) && $targetTimeFromStr === $startStr) $rank -= 1000;

                                $suggestions[] = [
                                    'day'                   => $d,
                                    'exam_date'             => $examDate ?? $nextDate,
                                    'start_time'            => $startStr,
                                    'end_time'              => $endStr,
                                    'duration_minutes'      => $dur,
                                    'rooms'                 => array_column($selected, 'room_name'),
                                    'total_capacity'        => $totalCap,
                                    'room_type'             => $roomType,
                                    'rank'                  => $rank,
                                    'is_preferred_duration' => $dur === $preferred,
                                    'is_combo'              => true,
                                ];
                            }
                        }
                    }

                    // --- Fallback combo: if no single room is big enough ---
                    if ($needed > 0) {
                        $singleFit = false;
                        foreach ($available as $r) { if ($r->capacity >= $needed) { $singleFit = true; break; } }
                        if (!$singleFit) {
                            $selected = []; $totalCap = 0;
                            foreach ($available as $r) { $selected[] = $r; $totalCap += $r->capacity; if ($totalCap >= $needed) break; }
                            if ($totalCap >= $needed) {
                                $comboKey = $d . '|' . $slot['start'] . '|fallback|' . implode(',', array_column($selected, 'room_name'));
                                if (!isset($seen[$comboKey])) {
                                    $seen[$comboKey] = true;
                                    $rank  = 5 + ($dur !== $preferred ? 2 : 0) + count($selected) * 3 + max(0, ($totalCap - $needed)) / 10;
                                    $suggestions[] = [
                                        'day'                   => $d,
                                        'exam_date'             => $examDate ?? $nextDate,
                                        'start_time'            => $startStr,
                                        'end_time'              => $endStr,
                                        'duration_minutes'      => $dur,
                                        'rooms'                 => array_column($selected, 'room_name'),
                                        'total_capacity'        => $totalCap,
                                        'room_type'             => $roomType,
                                        'rank'                  => $rank,
                                        'is_preferred_duration' => $dur === $preferred,
                                        'is_combo'              => true,
                                    ];
                                }
                            } else {
                                $total = array_sum(array_column($available, 'capacity'));
                                $rejected[] = ['day' => $d, 'slot' => $slot, 'reason' => "سعة القاعات غير كافية (مطلوب {$needed}، متوفر {$total})"];
                            }
                        }
                    }
                }
            }
        }

        usort($suggestions, fn($a, $b) => $a['rank'] <=> $b['rank']);

        return [
            'suggestions' => array_slice($suggestions, 0, 15),
            'rejected'    => array_slice($rejected, 0, 5),
        ];
    }


    private function generateTimeSlots(int $duration): array
    {
        $slots = [];
        for ($start = self::WORK_START; $start + $duration <= self::WORK_END; $start += 30) {
            $slots[] = ['start' => $start, 'end' => $start + $duration];
        }
        return $slots;
    }

    /**
     * Returns one suggestion per qualifying individual room, PLUS a combined suggestion
     * when student count requires multiple rooms OR as an additional option when a single
     * room is enough (to allow distributing students across rooms).
     */
    private function evaluateSlotPerRoom(array $opts): array
    {
        ['day' => $day, 'startMin' => $startMin, 'endMin' => $endMin,
         'duration' => $duration, 'studentCount' => $studentCount,
         'lecturer' => $lecturer, 'faculty' => $faculty,
         'roomType' => $roomType, 'preferredDuration' => $preferredDuration] = $opts;
        $examDate = $opts['examDate'] ?? null; // for checking scheduled exams

        if ($startMin < self::WORK_START || $endMin > self::WORK_END) {
            return ['valid' => [], 'reason' => 'خارج ساعات العمل'];
        }

        if ($lecturer && !$this->occupancy->isLecturerFree($lecturer, $day, $startMin, $endMin)) {
            return ['valid' => [], 'reason' => 'تعارض في جدول المحاضر'];
        }

        $allRooms = $this->occupancy->getAllRooms($faculty);
        $available = array_filter($allRooms, function($r) use ($roomType, $day, $startMin, $endMin, $examDate) {
            if ($roomType && $r->room_type !== $roomType) return false;
            return $this->occupancy->isRoomFree($r->room_name, $day, $startMin, $endMin, $examDate);
        });
        usort($available, fn($a, $b) => $b->capacity - $a->capacity);
        $available = array_values($available);

        if (!$available) {
            return ['valid' => [], 'reason' => 'لا توجد قاعات متاحة في هذا الوقت'];
        }

        $needed  = (int)$studentCount;
        $occ     = $this->occupancy;
        $results = [];

        // --- One suggestion per room that individually satisfies capacity ---
        foreach ($available as $r) {
            if ($needed > 0 && $r->capacity < $needed) continue; // room too small

            $rank  = 0;
            if ($duration !== $preferredDuration) $rank += 2;
            $rank += max(0, ($r->capacity - $needed)) / 10; // prefer tighter fit
            
            if ($faculty && strtolower($r->faculty) === strtolower($faculty)) {
                $rank -= 1.5; // Bonus for same faculty
            }

            $results[] = [
                'valid'                 => true,
                'start_time'            => $occ->minutesToTime($startMin),
                'end_time'              => $occ->minutesToTime($endMin),
                'duration_minutes'      => $duration,
                'rooms'                 => [$r->room_name],
                'rooms_detail'          => [$r],
                'total_capacity'        => $r->capacity,
                'room_type'             => $roomType,
                'rank'                  => $rank,
                'is_preferred_duration' => $duration === $preferredDuration,
                'is_combo'              => false,
            ];
        }

        // --- Always try to build a multi-room combo suggestion ---
        // This is useful even when a single room fits, to allow distributing students.
        if ($needed > 0 && count($available) >= 2) {
            $selected      = [];
            $totalCapacity = 0;
            foreach ($available as $r) {
                $selected[]     = $r;
                $totalCapacity += $r->capacity;
                if ($totalCapacity >= $needed && count($selected) >= 2) break;
            }
            // Only add combo if it involves 2+ rooms AND total capacity is sufficient
            if (count($selected) >= 2 && $totalCapacity >= $needed) {
                $rank  = 0;
                if ($duration !== $preferredDuration) $rank += 2;
                // Slightly penalise combos vs single rooms to rank them lower
                $rank += count($selected) * 2;
                $rank += max(0, ($totalCapacity - $needed)) / 10;
                
                $facultyMatchCount = count(array_filter($selected, fn($r) => $faculty && strtolower($r->faculty) === strtolower($faculty)));
                if ($facultyMatchCount > 0) {
                    $rank -= ($facultyMatchCount * 1.5);
                }

                $results[] = [
                    'valid'                 => true,
                    'start_time'            => $occ->minutesToTime($startMin),
                    'end_time'              => $occ->minutesToTime($endMin),
                    'duration_minutes'      => $duration,
                    'rooms'                 => array_column($selected, 'room_name'),
                    'rooms_detail'          => $selected,
                    'total_capacity'        => $totalCapacity,
                    'room_type'             => $roomType,
                    'rank'                  => $rank,
                    'is_preferred_duration' => $duration === $preferredDuration,
                    'is_combo'              => true,
                ];
            }
        }

        // --- Fallback: if no single room fits but combo might ---
        if (empty($results) && $needed > 0) {
            $selected      = [];
            $totalCapacity = 0;
            foreach ($available as $r) {
                $selected[]     = $r;
                $totalCapacity += $r->capacity;
                if ($totalCapacity >= $needed) break;
            }
            if ($totalCapacity >= $needed) {
                $rank  = 5; // higher base rank for fallback combos
                if ($duration !== $preferredDuration) $rank += 2;
                $rank += count($selected) * 3;
                $rank += max(0, ($totalCapacity - $needed)) / 10;
                
                $facultyMatchCount = count(array_filter($selected, fn($r) => $faculty && strtolower($r->faculty) === strtolower($faculty)));
                if ($facultyMatchCount > 0) {
                    $rank -= ($facultyMatchCount * 1.5);
                }

                $results[] = [
                    'valid'                 => true,
                    'start_time'            => $occ->minutesToTime($startMin),
                    'end_time'              => $occ->minutesToTime($endMin),
                    'duration_minutes'      => $duration,
                    'rooms'                 => array_column($selected, 'room_name'),
                    'rooms_detail'          => $selected,
                    'total_capacity'        => $totalCapacity,
                    'room_type'             => $roomType,
                    'rank'                  => $rank,
                    'is_preferred_duration' => $duration === $preferredDuration,
                    'is_combo'              => true,
                ];
            } else {
                $total = array_sum(array_column($available, 'capacity'));
                return ['valid' => [], 'reason' => "سعة القاعات غير كافية (مطلوب {$needed}، متوفر {$total})"];
            }
        }

        // If no studentCount given, just return the first available room
        if (empty($results) && $needed === 0 && !empty($available)) {
            $r = $available[0];
            $results[] = [
                'valid'                 => true,
                'start_time'            => $occ->minutesToTime($startMin),
                'end_time'              => $occ->minutesToTime($endMin),
                'duration_minutes'      => $duration,
                'rooms'                 => [$r->room_name],
                'rooms_detail'          => [$r],
                'total_capacity'        => $r->capacity,
                'room_type'             => $roomType,
                'rank'                  => 0,
                'is_preferred_duration' => $duration === $preferredDuration,
                'is_combo'              => false,
            ];
        }

        return ['valid' => $results, 'reason' => ''];
    }

    private function getDayPreferredDuration(?string $day): int
    {
        return $this->dayPreferences[$day]['preferred'] ?? 60;
    }

    /** Convert "HH:MM" string to total minutes since midnight */
    private function timeToMinutes(string $time): int
    {
        [$h, $m] = explode(':', $time);
        return (int)$h * 60 + (int)$m;
    }
}
