<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\OccupancyService;
use App\Services\DayNormalizationService;
use App\Services\SchedulingConflictService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ConflictsController extends Controller
{
    public function __construct(
        protected OccupancyService          $occupancy,
        protected DayNormalizationService   $dayService,
        protected SchedulingConflictService $conflictService,
    ) {}

    /** POST /api/conflicts/rebuild */
    public function rebuild()
    {
        // Archive old conflicts instead of hard-deleting (preserves audit trail)
        DB::table('conflicts')
            ->whereIn('conflict_type', ['lecture_overlap', 'room_conflict', 'lecturer_conflict', 'capacity_issue', 'uncertain_day_conflict', 'own_course_lecture_warning'])
            ->update(['conflict_type' => DB::raw("CONCAT('stale_', conflict_type)")]);

        $removedFalse = 0;
        $conflicts    = [];

        $scheduledExams = DB::table('scheduled_exams')
            ->where('status', '!=', 'cancelled')
            ->get()
            ->toArray();

        for ($i = 0; $i < count($scheduledExams); $i++) {
            $examA  = $scheduledExams[$i];
            $roomsA = json_decode($examA->rooms_json ?? '[]', true) ?? [];

            // ── CRITICAL FIX: derive day from exam_date, not stored day string ──
            $dayA = $examA->exam_date
                ? $this->dayService->dayFromDate($examA->exam_date)
                : strtolower($examA->day ?? '');

            $startA = $this->occupancy->toMinutes($examA->start_time);
            $endA   = $this->occupancy->toMinutes($examA->end_time);

            // ── 1. Exam vs Exam conflicts ──────────────────────────────
            for ($j = $i + 1; $j < count($scheduledExams); $j++) {
                $examB = $scheduledExams[$j];

                $dayB = $examB->exam_date
                    ? $this->dayService->dayFromDate($examB->exam_date)
                    : strtolower($examB->day ?? '');

                // Different actual dates → no conflict possible
                if ($examA->exam_date && $examB->exam_date && $examA->exam_date !== $examB->exam_date) continue;
                if ($dayA !== $dayB) continue;

                $roomsB = json_decode($examB->rooms_json ?? '[]', true) ?? [];
                $startB = $this->occupancy->toMinutes($examB->start_time);
                $endB   = $this->occupancy->toMinutes($examB->end_time);

                // Strict overlap (touching boundaries are NOT a conflict)
                if (!($startA < $endB && $endA > $startB)) continue;

                $sharedRooms = array_intersect($roomsA, $roomsB);
                foreach ($sharedRooms as $room) {
                    $conflicts[] = [
                        'conflict_type'  => 'room_conflict',
                        'reference_type' => 'scheduled_exam',
                        'reference_id'   => $examA->id,
                        'faculty'        => $examA->faculty,
                        'room'           => $room,
                        'lecturer'       => null,
                        'day'            => $dayA,
                        'exam_date'      => $examA->exam_date,
                        'start_time'     => $examA->start_time,
                        'end_time'       => $examA->end_time,
                        'message'        => "تعارض في القاعة {$room} بين \"{$examA->course_code}\" و \"{$examB->course_code}\" في تاريخ {$examA->exam_date}",
                        'severity'       => 'error',
                        'details_json'   => json_encode(['exam_a_id' => $examA->id, 'exam_b_id' => $examB->id, 'exam_date' => $examA->exam_date, 'exam_day' => $dayA]),
                        'created_at'     => now(),
                    ];
                }

                if ($examA->lecturer && $examB->lecturer && $examA->lecturer === $examB->lecturer) {
                    $conflicts[] = [
                        'conflict_type'  => 'lecturer_conflict',
                        'reference_type' => 'scheduled_exam',
                        'reference_id'   => $examA->id,
                        'faculty'        => $examA->faculty,
                        'room'           => null,
                        'lecturer'       => $examA->lecturer,
                        'day'            => $dayA,
                        'exam_date'      => $examA->exam_date,
                        'start_time'     => $examA->start_time,
                        'end_time'       => $examA->end_time,
                        'message'        => "تعارض في جدول المحاضر {$examA->lecturer} بين \"{$examA->course_code}\" و \"{$examB->course_code}\"",
                        'severity'       => 'error',
                        'details_json'   => json_encode(['exam_a_id' => $examA->id, 'exam_b_id' => $examB->id]),
                        'created_at'     => now(),
                    ];
                }
            }

            // ── 2. Exam vs Parsed Lecture Sessions ─────────────────────
            foreach ($roomsA as $room) {
                $sessions = DB::table('parsed_sessions as ps')
                    ->join('uploaded_files as uf', 'ps.uploaded_file_id', '=', 'uf.id')
                    ->select('ps.*', 'uf.original_name as source_file')
                    ->whereRaw('LOWER(ps.room) = LOWER(?)', [$room])
                    ->where('ps.is_valid', 1)
                    ->where('uf.is_active', 1)
                    ->whereNotNull('ps.start_time')
                    ->get();

                foreach ($sessions as $session) {
                    // ── Normalize session days (THE CRITICAL FIX) ─────
                    $sessionDayInfo = $this->dayService->getSessionDays($session, $examA->exam_date);
                    $sessionDays    = $sessionDayInfo['days'];

                    if (empty($sessionDays)) {
                        // Cannot determine day → uncertain warning only
                        $conflicts[] = [
                            'conflict_type'  => 'uncertain_day_conflict',
                            'reference_type' => 'scheduled_exam',
                            'reference_id'   => $examA->id,
                            'faculty'        => $examA->faculty,
                            'room'           => $room,
                            'lecturer'       => null,
                            'day'            => $dayA,
                            'exam_date'      => $examA->exam_date,
                            'start_time'     => $examA->start_time,
                            'end_time'       => $examA->end_time,
                            'message'        => "تعذر تحديد يوم المحاضرة لمادة \"{$session->course_name}\" في القاعة {$room} — يرجى المراجعة",
                            'severity'       => 'warning',
                            'details_json'   => json_encode(['exam_date' => $examA->exam_date, 'exam_day' => $dayA, 'session_id' => $session->id, 'session_day_raw' => $session->day ?? null]),
                            'created_at'     => now(),
                        ];
                        continue;
                    }

                    // ── Day check: exam day MUST be in session days ────
                    if (!in_array($dayA, $sessionDays, true)) {
                        $removedFalse++; // This is a false conflict — exam is on different day
                        continue;
                    }

                    // ── Strict time overlap ───────────────────────────
                    $sesStart = $this->occupancy->toMinutes($session->start_time);
                    $sesEnd   = $this->occupancy->toMinutes($session->end_time ?? '23:59');
                    if (!($startA < $sesEnd && $endA > $sesStart)) continue;

                    // ── Own-course lecture exception ──────────────────
                    $examSections = DB::table('scheduled_exam_sections')
                        ->where('scheduled_exam_id', $examA->id)
                        ->get()
                        ->map(fn($s) => ['section_number' => $s->section_number, 'section_key' => $s->section_key, 'course_code' => $s->course_code])
                        ->toArray();

                    $ownCourse = $this->conflictService->shouldIgnoreOwnCourseLectureConflict([
                        'course_code'       => $examA->course_code,
                        'course_name'       => $examA->course_name,
                        'selected_sections' => $examSections,
                        'selection_mode'    => 'selected_sections',
                    ], $session);

                    if ($ownCourse === 'ignore') continue;

                    $details = [
                        'exam_date'      => $examA->exam_date,
                        'exam_day'       => $dayA,
                        'exam_time'      => "{$examA->start_time} - {$examA->end_time}",
                        'session_days'   => $sessionDays,
                        'session_id'     => $session->id,
                        'session_course' => $session->course_name,
                        'session_time'   => "{$session->start_time} - " . ($session->end_time ?? '?'),
                        'room'           => $room,
                        'day_match'      => true,
                        'time_overlap'   => true,
                        'own_course'     => ($ownCourse !== false),
                    ];

                    if ($ownCourse === 'warn') {
                        $conflicts[] = [
                            'conflict_type'  => 'own_course_lecture_warning',
                            'reference_type' => 'scheduled_exam',
                            'reference_id'   => $examA->id,
                            'faculty'        => $examA->faculty,
                            'room'           => $room,
                            'lecturer'       => $session->lecturer ?? null,
                            'day'            => $dayA,
                            'exam_date'      => $examA->exam_date,
                            'start_time'     => $examA->start_time,
                            'end_time'       => $examA->end_time,
                            'message'        => "تحذير: المحاضرة في القاعة {$room} تبدو لنفس المادة \"{$session->course_name}\" — تحقق من الشعبة",
                            'severity'       => 'warning',
                            'details_json'   => json_encode($details),
                            'created_at'     => now(),
                        ];
                        continue;
                    }

                    // Real blocking conflict
                    $conflicts[] = [
                        'conflict_type'  => 'lecture_overlap',
                        'reference_type' => 'scheduled_exam',
                        'reference_id'   => $examA->id,
                        'faculty'        => $examA->faculty,
                        'room'           => $room,
                        'lecturer'       => $session->lecturer ?? null,
                        'day'            => $dayA,
                        'exam_date'      => $examA->exam_date,
                        'start_time'     => $examA->start_time,
                        'end_time'       => $examA->end_time,
                        'message'        => "الاختبار \"{$examA->course_code}\" يتعارض مع محاضرة \"{$session->course_name}\" في القاعة {$room} يوم {$dayA}",
                        'severity'       => 'error',
                        'details_json'   => json_encode($details),
                        'created_at'     => now(),
                    ];
                }
            }
        }

        // ── 3. Capacity issues ──────────────────────────────────────────
        $sessionsPerCourse = [];
        foreach ($scheduledExams as $exam) {
            if (!empty($exam->course_code)) {
                $sessionsPerCourse[$exam->course_code] = ($sessionsPerCourse[$exam->course_code] ?? 0) + 1;
            }
        }

        foreach ($scheduledExams as $exam) {
            if ($exam->student_count > 0) {
                $sessionCount = $sessionsPerCourse[$exam->course_code] ?? 1;
                
                // Fallback to name/notes if session count is somehow 1 but it says "جلسة"
                if ($sessionCount === 1 && preg_match('/(جلسة|فترة)/u', $exam->course_name . ' ' . ($exam->notes ?? ''))) {
                    $sessionCount = 2;
                }

                $requiredCapacity = (int)ceil($exam->student_count / $sessionCount);

                if ($exam->total_capacity < $requiredCapacity) {
                    $message = "سعة القاعة ({$exam->total_capacity}) أقل من عدد الطلاب ({$requiredCapacity}) في \"{$exam->course_code}\"";
                    if ($sessionCount > 1) {
                        $message .= " (العدد الإجمالي {$exam->student_count} مقسم على {$sessionCount} جلسات)";
                    }

                    $conflicts[] = [
                        'conflict_type'  => 'capacity_issue',
                        'reference_type' => 'scheduled_exam',
                        'reference_id'   => $exam->id,
                        'faculty'        => $exam->faculty,
                        'room'           => null,
                        'lecturer'       => null,
                        'day'            => $exam->day,
                        'exam_date'      => $exam->exam_date,
                        'start_time'     => $exam->start_time,
                        'end_time'       => $exam->end_time,
                        'message'        => $message,
                        'severity'       => 'warning',
                        'created_at'     => now(),
                    ];
                }
            }
        }

        // ── 4. Unscheduled exam requests ────────────────────────────────
        $unscheduled = DB::table('exam_requests')->where('status', 'pending')->get();
        foreach ($unscheduled as $req) {
            $conflicts[] = [
                'conflict_type'  => 'unscheduled',
                'reference_type' => 'exam_request',
                'reference_id'   => $req->id,
                'faculty'        => $req->faculty,
                'room'           => null,
                'lecturer'       => null,
                'day'            => null,
                'exam_date'      => null,
                'start_time'     => null,
                'end_time'       => null,
                'message'        => "طلب الاختبار \"{$req->course_code} - {$req->section}\" لم يتم جدولته بعد",
                'severity'       => 'warning',
                'created_at'     => now(),
            ];
        }

        // ── 5. Invalid parse rows ───────────────────────────────────────
        $invalidCount = DB::table('parsed_sessions')->where('is_valid', 0)->count();
        if ($invalidCount > 0) {
            $conflicts[] = [
                'conflict_type'  => 'parse_error',
                'reference_type' => 'parsed_sessions',
                'reference_id'   => null,
                'faculty'        => null,
                'room'           => null,
                'lecturer'       => null,
                'day'            => null,
                'exam_date'      => null,
                'start_time'     => null,
                'end_time'       => null,
                'message'        => "يوجد {$invalidCount} سجل غير صالح في جداول المحاضرات",
                'severity'       => 'warning',
                'created_at'     => now(),
            ];
        }

        // Purge stale records
        DB::table('conflicts')->where('conflict_type', 'like', 'stale_%')->delete();

        if ($conflicts) {
            foreach (array_chunk($conflicts, 100) as $chunk) {
                DB::table('conflicts')->insert($chunk);
            }
        }

        return response()->json([
            'success'                 => true,
            'conflicts_count'         => count($conflicts),
            'false_conflicts_removed' => $removedFalse,
            'message'                 => "تمت إعادة فحص التعارضات. تم إزالة {$removedFalse} تعارض غير صحيح.",
        ]);
    }

    /** GET /api/conflicts */
    public function index(Request $request)
    {
        $query = DB::table('conflicts')
            ->where('conflict_type', 'not like', 'stale_%');

        if ($severity = $request->query('severity')) $query->where('severity', $severity);
        if ($type     = $request->query('type'))     $query->where('conflict_type', $type);
        if ($day      = $request->query('day'))      $query->where('day', $day);
        if ($room     = $request->query('room'))     $query->where('room', $room);

        $conflicts = $query->orderByDesc('severity')->orderByDesc('created_at')->get()
            ->map(function ($c) {
                $c->details = $c->details_json ? json_decode($c->details_json, true) : null;
                return $c;
            });

        $summary = [
            'total'    => $conflicts->count(),
            'errors'   => $conflicts->where('severity', 'error')->count(),
            'warnings' => $conflicts->where('severity', 'warning')->count(),
            'by_type'  => $conflicts->groupBy('conflict_type')->map->count(),
        ];

        return response()->json(['conflicts' => $conflicts, 'summary' => $summary]);
    }
}
