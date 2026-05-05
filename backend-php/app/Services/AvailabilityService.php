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

        $suggestions = [];
        $rejected    = [];
        $seen        = []; // deduplicate identical room+time combinations

        $targetDuration = $duration ?: $this->getDayPreferredDuration($day);
        $days = $day ? [$day] : ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];

        foreach ($days as $d) {
            $preferred  = $this->dayPreferences[$d]['preferred'] ?? 60;
            $alternate  = $this->dayPreferences[$d]['alternate'] ?? 90;
            $durations  = array_unique(array_filter([$targetDuration, $preferred, $alternate]));

            foreach ($durations as $dur) {
                $slots = $this->generateTimeSlots($dur);
                foreach ($slots as $slot) {
                    // Require the entire slot to be within the preferred time window
                    if ($timeFromMin !== null && $slot['start'] < $timeFromMin) continue;
                    if ($timeToMin   !== null && $slot['end']   > $timeToMin)   continue;

                    // Generate one suggestion per available room (not just the first fit)
                    $perRoomResults = $this->evaluateSlotPerRoom([
                        'day'               => $d,
                        'startMin'          => $slot['start'],
                        'endMin'            => $slot['end'],
                        'duration'          => $dur,
                        'studentCount'      => $studentCount,
                        'lecturer'          => $lecturer,
                        'faculty'           => $faculty,
                        'roomType'          => $roomType,
                        'preferredDuration' => $preferred,
                    ]);

                    foreach ($perRoomResults['valid'] as $result) {
                        $key = $d . '|' . $slot['start'] . '|' . implode(',', $result['rooms']);
                        if (isset($seen[$key])) continue;
                        $seen[$key] = true;
                        $suggestions[] = array_merge($result, ['day' => $d]);
                    }
                    if (empty($perRoomResults['valid']) && !empty($perRoomResults['reason'])) {
                        $rejected[] = ['day' => $d, 'slot' => $slot, 'reason' => $perRoomResults['reason']];
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
     * Returns one suggestion per qualifying individual room, plus a combined suggestion
     * when no single room can cover the required student count.
     */
    private function evaluateSlotPerRoom(array $opts): array
    {
        ['day' => $day, 'startMin' => $startMin, 'endMin' => $endMin,
         'duration' => $duration, 'studentCount' => $studentCount,
         'lecturer' => $lecturer, 'faculty' => $faculty,
         'roomType' => $roomType, 'preferredDuration' => $preferredDuration] = $opts;

        if ($startMin < self::WORK_START || $endMin > self::WORK_END) {
            return ['valid' => [], 'reason' => 'خارج ساعات العمل'];
        }

        if ($lecturer && !$this->occupancy->isLecturerFree($lecturer, $day, $startMin, $endMin)) {
            return ['valid' => [], 'reason' => 'تعارض في جدول المحاضر'];
        }

        $allRooms = $this->occupancy->getAllRooms($faculty);
        $available = array_filter($allRooms, function($r) use ($roomType, $day, $startMin, $endMin) {
            if ($roomType && $r->room_type !== $roomType) return false;
            return $this->occupancy->isRoomFree($r->room_name, $day, $startMin, $endMin);
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
            ];
        }

        // --- If no single room is big enough, suggest the smallest combo ---
        if (empty($results) && $needed > 0) {
            $selected      = [];
            $totalCapacity = 0;
            foreach ($available as $r) {
                $selected[]     = $r;
                $totalCapacity += $r->capacity;
                if ($totalCapacity >= $needed) break;
            }
            if ($totalCapacity >= $needed) {
                $rank  = 0;
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
