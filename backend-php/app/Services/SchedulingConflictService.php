<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * SchedulingConflictService
 *
 * Central conflict-detection engine for exam scheduling.
 * All checks are performed at the DATABASE level — the UI suggestions
 * are advisory only; this service is the authoritative guard.
 *
 * Usage in controller:
 *   $conflicts = $this->conflictService->getAllConflicts($data);
 *   if (!empty($conflicts)) {
 *       return response()->json(['success' => false, 'conflicts' => $conflicts], 422);
 *   }
 */
class SchedulingConflictService
{
    // ── Config Defaults (overridable via .env) ────────────────────────────
    private int   $workStartMinutes;
    private int   $workEndMinutes;
    private int   $minDurationMinutes;
    private int   $maxDurationMinutes;

    public function __construct()
    {
        $this->workStartMinutes   = $this->parseTime(env('EXAM_WORK_START', '08:00'));
        $this->workEndMinutes     = $this->parseTime(env('EXAM_WORK_END',   '18:00'));
        $this->minDurationMinutes = (int) env('EXAM_MIN_DURATION', 30);
        $this->maxDurationMinutes = (int) env('EXAM_MAX_DURATION', 240);
    }

    // ─────────────────────────────────────────────────────────────────────
    // PUBLIC: Run all checks and return merged conflict array
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Run every conflict check and return a flat array of found conflicts.
     * Empty array = no conflicts, safe to schedule.
     *
     * @param array $data {
     *   rooms          : string[]   list of room names
     *   day            : string     e.g. "sunday"
     *   exam_date      : string     YYYY-MM-DD (optional)
     *   start_time     : string     HH:MM
     *   end_time       : string     HH:MM
     *   duration_minutes: int
     *   student_count  : int
     *   lecturer       : string|null
     *   course_code    : string|null
     *   section        : string|null
     *   exclude_exam_id: int|null   when updating, skip self
     * }
     */
    public function getAllConflicts(array $data): array
    {
        $conflicts = [];
        
        $isFullDay = filter_var($data['is_full_day'] ?? false, FILTER_VALIDATE_BOOLEAN);

        // Normalize Date & Time
        $dtService = app(DateTimeNormalizationService::class);
        $data['exam_date'] = $dtService->normalizeDate($data['exam_date'] ?? null);
        
        if (!$isFullDay) {
            $data['start_time'] = $dtService->normalizeTime($data['start_time'] ?? null);
            $data['end_time'] = $dtService->normalizeTime($data['end_time'] ?? null);
            
            $conflicts = array_merge($conflicts, $this->validateTimeRange($data));
            if (!empty($conflicts)) return $conflicts; // stop early if time is invalid

            $conflicts = array_merge($conflicts, $this->validateWorkingHours($data));
        } else {
            if (empty($data['exam_date'])) {
                $conflicts[] = $this->makeConflict('missing_date', 'تاريخ الاختبار مطلوب لحجز يوم كامل');
                return $conflicts;
            }
            // For full day, set times to full working hours for overlap checks
            $data['start_time'] = $dtService->normalizeTime($this->minutesToTime($this->workStartMinutes));
            $data['end_time'] = $dtService->normalizeTime($this->minutesToTime($this->workEndMinutes));
        }

        $conflicts = array_merge($conflicts, $this->checkBlackoutDates($data));
        $conflicts = array_merge($conflicts, $this->checkRoomConflicts($data));
        $conflicts = array_merge($conflicts, $this->checkLectureConflicts($data));
        $conflicts = array_merge($conflicts, $this->checkInstructorConflicts($data));
        $conflicts = array_merge($conflicts, $this->checkSectionConflicts($data));
        $conflicts = array_merge($conflicts, $this->checkCapacity($data));

        return $conflicts;
    }

    /**
     * Return ONLY blocking conflicts (excludes severity=info/warning types).
     * Use this to decide whether to reject a scheduling request.
     */
    public function getBlockingConflicts(array $data): array
    {
        $NON_BLOCKING = ['own_course_lecture_ignored', 'own_course_lecture_warning', 'capacity_conflict'];
        return array_values(array_filter(
            $this->getAllConflicts($data),
            fn($c) => !in_array($c['type'] ?? '', $NON_BLOCKING, true)
        ));
    }

    /**
     * Return ONLY non-blocking warnings/notices.
     */
    public function getWarnings(array $data): array
    {
        $NON_BLOCKING = ['own_course_lecture_ignored', 'own_course_lecture_warning', 'capacity_conflict'];
        return array_values(array_filter(
            $this->getAllConflicts($data),
            fn($c) => in_array($c['type'] ?? '', $NON_BLOCKING, true)
        ));
    }



    // ─────────────────────────────────────────────────────────────────────
    // 1. TIME RANGE VALIDATION
    // ─────────────────────────────────────────────────────────────────────

    public function validateTimeRange(array $data): array
    {
        $conflicts = [];

        $start = trim($data['start_time'] ?? '');
        $end   = trim($data['end_time'] ?? '');

        if (empty($start) || empty($end)) {
            $conflicts[] = $this->makeConflict(
                'invalid_time',
                'وقت البداية أو النهاية مفقود',
                []
            );
            return $conflicts;
        }

        if (!$this->isValidTime($start)) {
            $conflicts[] = $this->makeConflict('invalid_time', "وقت البداية غير صالح: {$start}", []);
        }
        if (!$this->isValidTime($end)) {
            $conflicts[] = $this->makeConflict('invalid_time', "وقت النهاية غير صالح: {$end}", []);
        }

        if (empty($conflicts)) {
            $startMin = $this->parseTime($start);
            $endMin   = $this->parseTime($end);
            $dur      = $endMin - $startMin;

            if ($startMin >= $endMin) {
                $conflicts[] = $this->makeConflict('invalid_time', 'وقت البداية يجب أن يكون قبل وقت النهاية', []);
            }

            if ($dur < $this->minDurationMinutes) {
                $conflicts[] = $this->makeConflict(
                    'invalid_time',
                    "مدة الاختبار ({$dur} دقيقة) أقل من الحد الأدنى المسموح ({$this->minDurationMinutes} دقيقة)",
                    []
                );
            }

            if ($dur > $this->maxDurationMinutes) {
                $conflicts[] = $this->makeConflict(
                    'invalid_time',
                    "مدة الاختبار ({$dur} دقيقة) تتجاوز الحد الأقصى المسموح ({$this->maxDurationMinutes} دقيقة)",
                    []
                );
            }
        }

        return $conflicts;
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2. WORKING HOURS
    // ─────────────────────────────────────────────────────────────────────

    public function validateWorkingHours(array $data): array
    {
        $conflicts  = [];
        $startMin   = $this->parseTime($data['start_time']);
        $endMin     = $this->parseTime($data['end_time']);
        $workStart  = $this->minutesToTime($this->workStartMinutes);
        $workEnd    = $this->minutesToTime($this->workEndMinutes);

        if ($startMin < $this->workStartMinutes || $endMin > $this->workEndMinutes) {
            $conflicts[] = $this->makeConflict(
                'outside_working_hours',
                "الاختبار خارج ساعات الدوام الجامعي ({$workStart} – {$workEnd})",
                [
                    'allowed_start' => $workStart,
                    'allowed_end'   => $workEnd,
                    'requested_start' => $data['start_time'],
                    'requested_end'   => $data['end_time'],
                ]
            );
        }

        return $conflicts;
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. BLACKOUT DATES
    // ─────────────────────────────────────────────────────────────────────

    public function checkBlackoutDates(array $data): array
    {
        $conflicts = [];
        $examDate  = $data['exam_date'] ?? null;
        if (!$examDate) return [];

        $blocked = DB::table('blackout_dates')
            ->where('start_date', '<=', $examDate)
            ->where('end_date',   '>=', $examDate)
            ->get();

        foreach ($blocked as $b) {
            $conflicts[] = $this->makeConflict(
                'blackout_date',
                "تاريخ الاختبار ({$examDate}) ضمن فترة محظورة: {$b->title}",
                [
                    'blackout_title'      => $b->title,
                    'blackout_start_date' => $b->start_date,
                    'blackout_end_date'   => $b->end_date,
                    'reason'              => $b->reason,
                ]
            );
        }

        return $conflicts;
    }

    // ─────────────────────────────────────────────────────────────────────
    // 4. ROOM CONFLICTS (exam vs exam)
    // ─────────────────────────────────────────────────────────────────────

    public function checkRoomConflicts(array $data): array
    {
        $conflicts    = [];
        $rooms        = $data['rooms'] ?? [];
        $day          = $data['day'] ?? null;
        $examDate     = $data['exam_date'] ?? null;
        $startMin     = $this->parseTime($data['start_time']);
        $endMin       = $this->parseTime($data['end_time']);
        $excludeId    = $data['exclude_exam_id'] ?? null;
        $isFullDay    = filter_var($data['is_full_day'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $scope        = $data['booking_scope'] ?? 'selected_rooms';

        // If scope is all_university, grab all rooms
        if ($isFullDay && $scope === 'all_university') {
            $rooms = DB::table('rooms')->pluck('room_name')->toArray();
        }

        if (empty($rooms)) return [];

        // Single query for all rooms
        $query = DB::table('scheduled_exams')
            ->where('status', '!=', 'cancelled')
            ->where(function($q) use ($rooms) {
                foreach ($rooms as $room) {
                    $q->orWhereRaw("JSON_CONTAINS(rooms_json, JSON_QUOTE(?))", [$room]);
                }
                $q->orWhere('booking_scope', 'all_university');
            });

        if ($examDate) {
            $query->where('exam_date', $examDate);
        } else {
            $query->whereRaw("LOWER(day) = LOWER(?)", [$day]);
        }

        if ($excludeId) {
            $query->where('id', '!=', $excludeId);
        }

        $existing = $query->get();

        foreach ($existing as $exam) {
            $exIsFullDay = filter_var($exam->is_full_day ?? false, FILTER_VALIDATE_BOOLEAN);
            $examRooms = json_decode($exam->rooms_json ?? '[]', true) ?: [];
            
            // Determine which requested rooms conflict with this exam
            $conflictingRooms = [];
            if ($exam->booking_scope === 'all_university') {
                $conflictingRooms = $rooms;
            } else {
                $conflictingRooms = array_intersect($rooms, $examRooms);
            }

            foreach ($conflictingRooms as $room) {
                // If either is a full day booking on the same date/room, it's a conflict
                if ($isFullDay || $exIsFullDay) {
                     $conflicts[] = $this->makeConflict(
                        'full_day_conflict',
                        "تعارض في القاعة {$room}: يوجد حجز يوم كامل أو حجز عادي في هذا التاريخ",
                        [
                            'room'                => $room,
                            'date'                => $examDate ?? $day,
                            'existing_exam_id'    => $exam->id,
                            'existing_course'     => $exam->course_code,
                            'is_full_day'         => $exIsFullDay
                        ]
                    );
                    continue; // Skip time check for full-day conflicts
                }

                $exStart = $this->parseTime($exam->start_time);
                $exEnd   = $this->parseTime($exam->end_time);

                if ($startMin < $exEnd && $endMin > $exStart) {
                    $conflicts[] = $this->makeConflict(
                        'room_conflict',
                        "تعارض في القاعة {$room}: مشغولة بـ \"{$exam->course_code}\" من {$exam->start_time} إلى {$exam->end_time}",
                        [
                            'room'                => $room,
                            'date'                => $examDate ?? $day,
                            'existing_exam_id'    => $exam->id,
                            'existing_course'     => $exam->course_code,
                            'existing_start_time' => $exam->start_time,
                            'existing_end_time'   => $exam->end_time,
                        ]
                    );
                }
            }
        }

        return $conflicts;
    }

    // ─────────────────────────────────────────────────────────────────────
    // 5. LECTURE CONFLICTS (exam vs parsed schedule) — with own-course exception
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Smart lecture conflict check.
     * Returns BLOCKING conflicts for sessions that genuinely block the exam.
     * Returns non-blocking WARNINGS for sessions that belong to the same course/section
     * as the exam (own-course lecture exception).
     *
     * Conflict types returned:
     *   lecture_conflict         — different course, or same course but excluded section (BLOCKING)
     *   uncertain_lecture_conflict — session has no course_code and no course_name (BLOCKING)
     *   own_course_lecture_ignored — same course + selected section (WARNING, non-blocking)
     */
    public function checkLectureConflicts(array $data): array
    {
        return $this->checkParsedLectureConflicts($data);
    }

    public function checkParsedLectureConflicts(array $data): array
    {
        $conflicts = [];
        $rooms     = $data['rooms'] ?? [];
        $examDate  = $data['exam_date'] ?? null;
        $startMin  = $this->parseTime($data['start_time']);
        $endMin    = $this->parseTime($data['end_time']);

        if (empty($rooms)) return [];

        // AUTHORITATIVE: derive exam day from exam_date if available, otherwise fall back to data['day']
        $dayService = app(DayNormalizationService::class);
        $examDay = $examDate
            ? $dayService->dayFromDate($examDate)
            : ($data['day'] ?? null);

        if (!$examDay) return [];

        // Fetch sessions for the room WITHOUT day filter in SQL — we do day matching in PHP
        // so we can handle any day format stored in the day column
        $sessions = DB::table('parsed_sessions as ps')
            ->join('uploaded_files as uf', 'ps.uploaded_file_id', '=', 'uf.id')
            ->select('ps.*', 'uf.original_name as source_file')
            ->whereIn('ps.room', $rooms)
            ->where('ps.is_valid', 1)
            ->where('uf.is_active', 1)
            ->whereNotNull('ps.start_time')
            ->whereNotNull('ps.end_time')
            ->get();

        foreach ($sessions as $session) {
            // ── Day matching (the critical fix) ───────────────────────
            $sessionDayInfo = $dayService->getSessionDays($session, $examDate);
            $sessionDays    = $sessionDayInfo['days'];

            if (empty($sessionDays)) {
                // Cannot determine lecture day → uncertain warning (NOT hard block)
                $conflicts[] = $this->makeConflict(
                    'uncertain_lecture_conflict',
                    "تعذر تحديد يوم المحاضرة لمادة \"{$session->course_name}\" في القاعة {$session->room} — يرجى المراجعة يدوياً",
                    [
                        'severity'        => 'warning',
                        'room'            => $session->room,
                        'session_id'      => $session->id,
                        'session_day_raw' => $session->day ?? null,
                        'start_time'      => $session->start_time,
                        'end_time'        => $session->end_time,
                    ]
                );
                continue;
            }

            // Exam day must be in session's days — otherwise SKIP (different weekday)
            if (!in_array($examDay, $sessionDays, true)) {
                continue; // No conflict — lecture is on a different day
            }

            $sesStart = $this->parseTime($session->start_time);
            $sesEnd   = $this->parseTime($session->end_time);

            // Strict overlap: A.start < B.end AND A.end > B.start (touching is NOT overlap)
            if (!($startMin < $sesEnd && $endMin > $sesStart)) {
                continue;
            }

            // ── Own-Course Lecture Exception ───────────────────────────
            $shouldIgnore = $this->shouldIgnoreOwnCourseLectureConflict($data, $session);

            if ($shouldIgnore === 'ignore') {
                // Non-blocking: same course, same selected section
                $conflicts[] = $this->makeConflict(
                    'own_course_lecture_ignored',
                    'تم تجاهل محاضرة لأنها لنفس المادة والشعبة المشمولة في الامتحان',
                    [
                        'severity'       => 'info',
                        'room'           => $session->room,
                        'course_code'    => $session->course_code ?? null,
                        'course_name'    => $session->course_name ?? null,
                        'section_number' => $session->section ?? null,
                        'start_time'     => $session->start_time,
                        'end_time'       => $session->end_time,
                    ]
                );
                continue;
            }

            if ($shouldIgnore === 'warn') {
                // Non-blocking: same course code match, no section detail available
                $conflicts[] = $this->makeConflict(
                    'own_course_lecture_warning',
                    'تم تجاهل محاضرة في نفس المختبر لأنها تبدو تابعة لنفس المادة المشمولة بالامتحان.',
                    [
                        'severity'    => 'warning',
                        'room'        => $session->room,
                        'course_code' => $session->course_code ?? null,
                        'course_name' => $session->course_name ?? null,
                        'start_time'  => $session->start_time,
                        'end_time'    => $session->end_time,
                    ]
                );
                continue;
            }

            // ── Uncertain session (no course info at all) ─────────────
            if (empty($session->course_code) && empty($session->course_name)) {
                $conflicts[] = $this->makeConflict(
                    'uncertain_lecture_conflict',
                    "يوجد استخدام للمختبر {$session->room} في نفس الوقت ولكن لا يمكن التأكد من المادة أو الشعبة.",
                    [
                        'room'       => $session->room,
                        'start_time' => $session->start_time,
                        'end_time'   => $session->end_time,
                    ]
                );
                continue;
            }

            // ── Standard blocking lecture conflict ─────────────────────
            $conflicts[] = $this->makeConflict(
                'lecture_conflict',
                "المختبر {$session->room} محجوز لمحاضرة مادة أخرى في نفس الوقت: \"{$session->course_name}\"",
                [
                    'room'                 => $session->room,
                    'date'                 => $examDate ?? $day,
                    'lecture_course'       => $session->course_name,
                    'lecture_course_code'  => $session->course_code,
                    'lecture_section'      => $session->section ?? null,
                    'lecture_start_time'   => $session->start_time,
                    'lecture_end_time'     => $session->end_time,
                    'lecture_lecturer'     => $session->lecturer,
                    'source_schedule_file' => $session->source_file,
                ]
            );
        }

        return $conflicts;
    }

    /**
     * Determine if a parsed lecture session should be ignored for conflict purposes.
     *
     * Returns:
     *   'ignore' — same course + selected section → fully ignore (info only)
     *   'warn'   — same course code but no section detail → warn but don't block
     *   false    — real conflict, do NOT ignore
     */
    public function shouldIgnoreOwnCourseLectureConflict(array $examData, object $session): string|false
    {
        $examCourseCode   = $this->normalizeCourseCode($examData['course_code'] ?? '');
        $sessionCourseCode= $this->normalizeCourseCode($session->course_code ?? '');
        $examCourseName   = $this->normalizeArabicCourseName($examData['course_name'] ?? $examData['name'] ?? '');
        $sessionCourseName= $this->normalizeArabicCourseName($session->course_name ?? '');

        // ── Primary: match by course_code ──────────────────────────────
        $codeMatch = !empty($examCourseCode) && !empty($sessionCourseCode)
            && $examCourseCode === $sessionCourseCode;

        // ── Fallback: match by course_name (if codes missing/differ) ───
        $nameMatch = !$codeMatch
            && !empty($examCourseName)
            && !empty($sessionCourseName)
            && $examCourseName === $sessionCourseName;

        if (!$codeMatch && !$nameMatch) {
            return false; // completely different course → real conflict
        }

        // Course matches — now check sections
        $selectedSections = $examData['selected_sections'] ?? [];
        $selectionMode    = $examData['selection_mode'] ?? 'selected_sections';
        $sessionSection   = $this->normalizeSectionNumber($session->section ?? '');

        // If all sections are selected
        if ($selectionMode === 'all_sections') {
            // Session has no section → uncertain, but we warn rather than block
            if (empty($sessionSection)) {
                return 'warn';
            }
            // All sections selected → this session's section is definitely included
            return 'ignore';
        }

        // Extract section numbers from selected_sections
        $selectedSectionNumbers = [];
        foreach ($selectedSections as $sec) {
            if (is_string($sec)) {
                // Could be a section_key like "601106-5-2025-2026-first" or just "5"
                if (strpos($sec, '-') !== false) {
                    $parts = explode('-', $sec);
                    if (count($parts) >= 2) {
                        $selectedSectionNumbers[] = $this->normalizeSectionNumber($parts[1]);
                    }
                } else {
                    $selectedSectionNumbers[] = $this->normalizeSectionNumber($sec);
                }
            } elseif (is_array($sec)) {
                $sn = $sec['section_number'] ?? $sec['section'] ?? $sec['section_key'] ?? '';
                if (!empty($sn)) {
                    // Handle section_key format
                    if (strpos($sn, '-') !== false) {
                        $parts = explode('-', $sn);
                        if (count($parts) >= 2) {
                            $selectedSectionNumbers[] = $this->normalizeSectionNumber($parts[1]);
                        }
                    } else {
                        $selectedSectionNumbers[] = $this->normalizeSectionNumber($sn);
                    }
                }
            }
        }
        $selectedSectionNumbers = array_values(array_filter(array_unique($selectedSectionNumbers)));

        // No sections data available for this exam
        if (empty($selectedSectionNumbers)) {
            if (empty($sessionSection)) {
                // Both sides lack section detail — same course, warn only
                return 'warn';
            }
            // Session has a section but exam doesn't specify → warn, don't block
            return 'warn';
        }

        // Session has no section number → if course matches, lean toward warn
        if (empty($sessionSection)) {
            return 'warn';
        }

        // Check if session section is included in exam sections
        if (in_array($sessionSection, $selectedSectionNumbers, true)) {
            return 'ignore';
        }

        // Section is NOT included → real conflict (exam doesn't cover this section's lecture)
        return false;
    }

    // ─────────────────────────────────────────────────────────────────────
    // NORMALIZERS (used for own-course exception comparisons)
    // ─────────────────────────────────────────────────────────────────────

    public function normalizeCourseCode(string $value): string
    {
        return strtolower(preg_replace('/\s+/', '', trim($value)));
    }

    public function normalizeArabicCourseName(string $value): string
    {
        // Remove tashkeel (Arabic diacritics)
        $value = preg_replace('/[\x{064B}-\x{065F}]/u', '', $value);
        // Normalize alef variants
        $value = preg_replace('/[أإآ]/u', 'ا', $value);
        // Normalize ta marbuta
        $value = str_replace('ة', 'ه', $value);
        // Normalize parentheses spacing
        $value = preg_replace('/\s*\(\s*/u', '(', $value);
        $value = preg_replace('/\s*\)\s*/u', ')', $value);
        // Normalize digits ١٢٣... to 123
        $value = strtr($value, [
            '٠'=>'0','١'=>'1','٢'=>'2','٣'=>'3','٤'=>'4',
            '٥'=>'5','٦'=>'6','٧'=>'7','٨'=>'8','٩'=>'9',
        ]);
        // Collapse multiple spaces
        $value = preg_replace('/\s+/u', ' ', trim($value));
        return mb_strtolower($value);
    }

    public function normalizeSectionNumber(string $value): string
    {
        // Convert Arabic digits to Latin, strip spaces
        $value = strtr(trim($value), [
            '٠'=>'0','١'=>'1','٢'=>'2','٣'=>'3','٤'=>'4',
            '٥'=>'5','٦'=>'6','٧'=>'7','٨'=>'8','٩'=>'9',
        ]);
        // Remove leading zeros for numeric sections ("05" → "5")
        if (is_numeric($value)) {
            $value = (string)(int)$value;
        }
        return strtolower(trim($value));
    }



    // ─────────────────────────────────────────────────────────────────────
    // 6. INSTRUCTOR CONFLICTS
    // ─────────────────────────────────────────────────────────────────────

    public function checkInstructorConflicts(array $data): array
    {
        $conflicts  = [];
        $lecturer   = trim($data['lecturer'] ?? '');
        $day        = $data['day'] ?? null;
        $examDate   = $data['exam_date'] ?? null;
        $startMin   = $this->parseTime($data['start_time']);
        $endMin     = $this->parseTime($data['end_time']);
        $excludeId  = $data['exclude_exam_id'] ?? null;

        if (!$lecturer || !$day) return [];

        // Check against other scheduled exams
        $query = DB::table('scheduled_exams')
            ->where('status', '!=', 'cancelled')
            ->whereRaw("LOWER(lecturer) = LOWER(?)", [$lecturer])
            ->whereRaw("LOWER(day) = LOWER(?)", [$day]);

        if ($excludeId) {
            $query->where('id', '!=', $excludeId);
        }

        foreach ($query->get() as $exam) {
            if ($examDate && $exam->exam_date && $exam->exam_date !== $examDate) {
                continue;
            }

            $exStart = $this->parseTime($exam->start_time);
            $exEnd   = $this->parseTime($exam->end_time);

            if ($startMin < $exEnd && $endMin > $exStart) {
                $conflicts[] = $this->makeConflict(
                    'instructor_conflict',
                    "المحاضر \"{$lecturer}\" لديه اختبار آخر في نفس الوقت: \"{$exam->course_code}\" من {$exam->start_time} إلى {$exam->end_time}",
                    [
                        'lecturer'            => $lecturer,
                        'date'                => $examDate ?? $day,
                        'existing_exam_id'    => $exam->id,
                        'existing_course'     => $exam->course_code,
                        'existing_start_time' => $exam->start_time,
                        'existing_end_time'   => $exam->end_time,
                    ]
                );
            }
        }

        // Also check against parsed lecture sessions for the same lecturer
        $sessions = DB::select("
            SELECT ps.*, uf.original_name as source_file
            FROM parsed_sessions ps
            JOIN uploaded_files uf ON ps.uploaded_file_id = uf.id
            WHERE LOWER(ps.lecturer) = LOWER(?)
              AND LOWER(ps.day)      = LOWER(?)
              AND ps.is_valid        = 1
              AND uf.is_active       = 1
              AND ps.start_time IS NOT NULL
        ", [$lecturer, $day]);

        foreach ($sessions as $session) {
            $sesStart = $this->parseTime($session->start_time);
            $sesEnd   = $this->parseTime($session->end_time);

            if ($startMin < $sesEnd && $endMin > $sesStart) {
                $conflicts[] = $this->makeConflict(
                    'instructor_conflict',
                    "المحاضر \"{$lecturer}\" لديه محاضرة في نفس الوقت: \"{$session->course_name}\" من {$session->start_time} إلى {$session->end_time}",
                    [
                        'lecturer'           => $lecturer,
                        'date'               => $day,
                        'lecture_course'     => $session->course_name,
                        'lecture_start_time' => $session->start_time,
                        'lecture_end_time'   => $session->end_time,
                    ]
                );
            }
        }

        return $conflicts;
    }

    // ─────────────────────────────────────────────────────────────────────
    // 7. SECTION / STUDENT GROUP CONFLICTS
    // ─────────────────────────────────────────────────────────────────────

    public function checkSectionConflicts(array $data): array
    {
        $conflicts   = [];
        $day         = $data['day'] ?? null;
        $examDate    = $data['exam_date'] ?? null;
        $startMin    = $this->parseTime($data['start_time']);
        $endMin      = $this->parseTime($data['end_time']);
        $excludeId   = $data['exclude_exam_id'] ?? null;
        $selectedSections = $data['selected_sections'] ?? [];

        if (empty($selectedSections) || !$day) return [];

        // Check each section to ensure it's not already scheduled
        foreach ($selectedSections as $sectionData) {
            $sectionKey = is_string($sectionData) ? $sectionData : ($sectionData['section_key'] ?? '');
            
            if (!$sectionKey) continue;

            $query = DB::table('scheduled_exam_sections')
                ->join('scheduled_exams', 'scheduled_exams.id', '=', 'scheduled_exam_sections.scheduled_exam_id')
                ->select('scheduled_exams.*', 'scheduled_exam_sections.course_code', 'scheduled_exam_sections.section_number')
                ->where('scheduled_exams.status', '!=', 'cancelled')
                ->where('scheduled_exam_sections.section_key', $sectionKey)
                ->whereRaw("LOWER(scheduled_exams.day) = LOWER(?)", [$day]);

            if ($excludeId) {
                $query->where('scheduled_exams.id', '!=', $excludeId);
            }

            foreach ($query->get() as $exam) {
                if ($examDate && $exam->exam_date && $exam->exam_date !== $examDate) {
                    continue;
                }

                $exStart = $this->parseTime($exam->start_time);
                $exEnd   = $this->parseTime($exam->end_time);

                if ($startMin < $exEnd && $endMin > $exStart) {
                    $conflicts[] = $this->makeConflict(
                        'section_conflict',
                        "الشعبة {$exam->section_number} من مادة {$exam->course_code} مجدولة مسبقاً في هذا الوقت",
                        [
                            'course_code'         => $exam->course_code,
                            'section_key'         => $sectionKey,
                            'date'                => $examDate ?? $day,
                            'existing_exam_id'    => $exam->id,
                            'existing_start_time' => $exam->start_time,
                            'existing_end_time'   => $exam->end_time,
                        ]
                    );
                }
            }
        }

        return $conflicts;
    }

    // ─────────────────────────────────────────────────────────────────────
    // 8. CAPACITY CHECK
    // ─────────────────────────────────────────────────────────────────────

    public function checkCapacity(array $data): array
    {
        $conflicts    = [];
        $rooms        = $data['rooms'] ?? [];
        $originalCount= (int)($data['student_count'] ?? 0);
        $studentCount = $originalCount;
        $courseName   = $data['course_name'] ?? '';
        $isFullDay    = filter_var($data['is_full_day'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $scope        = $data['booking_scope'] ?? 'selected_rooms';

        if ($studentCount === 0) return [];

        // إذا كان الامتحان مقسماً على جلسات، نعتبر أن العدد المطلوب هو النصف
        $isSplitSession = false;
        $combinedText = $courseName . ' ' . ($data['notes'] ?? '') . ' ' . json_encode($data['section_numbers'] ?? []) . ' ' . ($data['section'] ?? '');
        if (preg_match('/(جلسة|فترة)/u', $combinedText)) {
            $studentCount = (int)ceil($studentCount / 2);
            $isSplitSession = true;
        }
        
        if ($isFullDay && $scope === 'all_university') {
            $totalCapacity = DB::table('rooms')->sum('capacity');
        } else {
            if (empty($rooms)) return [];
            $totalCapacity = DB::table('rooms')
                ->whereIn('room_name', $rooms)
                ->sum('capacity');
        }

        if ($totalCapacity < $studentCount) {
            $message = "السعة الكلية للقاعات المختارة ({$totalCapacity}) أقل من عدد طلاب الاختبار ({$studentCount})";
            if ($isSplitSession) {
                $message .= " (العدد الإجمالي {$originalCount} مقسم على جلسات)";
            }
            $conflicts[] = $this->makeConflict(
                'capacity_conflict',
                $message,
                [
                    'rooms'          => $rooms,
                    'total_capacity' => $totalCapacity,
                    'student_count'  => $studentCount,
                    'shortage'       => $studentCount - $totalCapacity,
                    'severity'       => 'warning', // Allow UI to bypass
                ]
            );
        }

        return $conflicts;
    }

    // ─────────────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────────────

    /** Build a standardised conflict entry */
    private function makeConflict(string $type, string $message, array $details = []): array
    {
        return array_merge([
            'type'    => $type,
            'message' => $message,
        ], $details);
    }

    /** "HH:MM" → total minutes from midnight */
    public function parseTime(string $time): int
    {
        if (!$time) return 0;
        // Handle both "HH:MM" and "HH:MM:SS"
        $parts = explode(':', $time);
        return ((int)($parts[0] ?? 0)) * 60 + ((int)($parts[1] ?? 0));
    }

    /** Total minutes from midnight → "HH:MM" */
    public function minutesToTime(int $minutes): string
    {
        $h = intdiv($minutes, 60);
        $m = $minutes % 60;
        return sprintf('%02d:%02d', $h, $m);
    }

    private function isValidTime(string $t): bool
    {
        return (bool) preg_match('/^\d{2}:\d{2}(:\d{2})?$/', $t);
    }
}
