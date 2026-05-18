<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AvailabilityService;
use App\Services\SchedulingConflictService;
use App\Services\AuditLogService;
use App\Services\RoomDistributionService;
use App\Services\InvigilatorService;
use App\Services\CourseSectionService;
use App\Services\DuplicateExamBookingService;
use App\Services\DateTimeNormalizationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ExamsController extends Controller
{
    public function __construct(
        protected AvailabilityService $availability,
        protected SchedulingConflictService $conflictService,
        protected AuditLogService $auditLogService,
        protected RoomDistributionService $roomDistributionService,
        protected InvigilatorService $invigilatorService,
        protected CourseSectionService $courseSectionService,
        protected DuplicateExamBookingService $duplicateBookingService,
        protected DateTimeNormalizationService $dateTimeNormalizationService
    ) {}

    // POST /api/exams/requests
    public function createRequest(Request $request)
    {
        $data = $request->json()->all();

        if (empty($data['faculty'])) {
            return response()->json(['success' => false, 'error' => 'يجب تحديد الكلية'], 400);
        }
        if (empty($data['course_code'])) {
            return response()->json(['success' => false, 'error' => 'يجب تحديد كود المادة'], 400);
        }

        $operatorName = $data['operator_name'] ?? 'Exam Coordinator';
        $operatorRole = $data['operator_role'] ?? 'admin';

        // Normalize selected_sections — accept both string keys and objects
        $rawSections    = $data['selected_sections'] ?? [];
        $sectionKeys    = $this->extractSectionKeys($rawSections);

        if (empty($sectionKeys)) {
            return response()->json(['success' => false, 'error' => 'يجب تحديد شعبة واحدة على الأقل'], 400);
        }

        // Backend recalculates total students — do NOT trust frontend value
        $resolved      = $this->courseSectionService->resolveSelectedSections($data['course_code'], $sectionKeys);
        $totalStudents = $resolved['total_students'];

        if ($totalStudents <= 0) {
            return response()->json(['success' => false, 'error' => 'لم يتم احتساب عدد الطلاب. تحقق من بيانات الشعب.'], 400);
        }

        DB::beginTransaction();
        try {
            $id = DB::table('exam_requests')->insertGetId([
                'course_code'             => $data['course_code'],
                'course_name'             => $data['course_name'] ?? null,
                'section'                 => $data['section'] ?? null,
                'lecturer'                => $data['lecturer'] ?? null,
                'student_count'           => $totalStudents,
                'total_students'          => $totalStudents,
                'selected_sections_count' => count($resolved['sections']),
                'selection_mode'          => $data['selection_mode'] ?? 'all_sections',
                'faculty'                 => $data['faculty'],
                'preferred_day'           => $data['preferred_day'] ?? null,
                'preferred_date'          => $data['preferred_date'] ?? null,
                'preferred_time_from'     => $data['preferred_time_from'] ?? null,
                'preferred_time_to'       => $data['preferred_time_to'] ?? null,
                'duration_minutes'        => $data['duration_minutes'] ?? 60,
                'room_type_preference'    => $data['room_type_preference'] ?? 'lab',
                'time_allocation_mode'    => $data['time_allocation_mode'] ?? 'auto',
                'is_full_day'             => filter_var($data['is_full_day'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'booking_scope'           => $data['booking_scope'] ?? null,
                'exam_type'               => $data['exam_type'] ?? null,
                'expected_students'       => $data['expected_students'] ?? null,
                'academic_year'           => $data['academic_year'] ?? null,
                'semester'                => $data['semester'] ?? null,
                'exam_period'             => $data['exam_period'] ?? null,
                'notes'                   => $data['notes'] ?? null,
                'status'                  => 'pending',
                'created_at'              => now(),
                'updated_at'              => now(),
            ]);

            foreach ($resolved['sections'] as $sec) {
                DB::table('exam_request_sections')->insert([
                    'exam_request_id' => $id,
                    'course_code'     => $data['course_code'],
                    'course_name'     => $data['course_name'] ?? '',
                    'section_key'     => $sec['section_key'],
                    'section_number'  => $sec['section_number'] ?? null,
                    'instructor_name' => $sec['instructor_name'] ?? null,
                    'student_count'   => $sec['student_count'] ?? 0,
                    'metadata'        => json_encode(['instructors' => $sec['instructors'] ?? []]),
                    'created_at'      => now(),
                    'updated_at'      => now(),
                ]);
            }

            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'error' => 'حدث خطأ أثناء حفظ الطلب', 'details' => $e->getMessage()], 500);
        }

        $this->auditLogService->log(
            action: 'request_created',
            entityType: 'exam_request',
            entityId: $id,
            newValues: ['course_code' => $data['course_code'], 'total_students' => $totalStudents],
            ipAddress: $request->ip(),
            operatorName: $operatorName,
            operatorRole: $operatorRole
        );

        return response()->json(['success' => true, 'exam' => DB::table('exam_requests')->find($id)]);
    }

    // GET /api/exams/requests
    public function listRequests(Request $request)
    {
        $query = DB::table('exam_requests');
        if ($faculty = $request->query('faculty')) $query->whereRaw('LOWER(faculty) = LOWER(?)', [$faculty]);
        if ($status  = $request->query('status'))  $query->where('status', $status);
        $exams = $query->orderByDesc('created_at')->get();
        return response()->json(['exams' => $exams]);
    }

    // GET /api/exams/requests/{id}
    public function showRequest(int $id)
    {
        $exam = DB::table('exam_requests')->find($id);
        if (!$exam) return response()->json(['success' => false, 'error' => 'الطلب غير موجود'], 404);
        $sections = DB::table('exam_request_sections')->where('exam_request_id', $id)->get();
        $approvals = DB::table('request_approvals')->where('request_id', $id)->orderBy('created_at')->get();
        return response()->json(['exam' => $exam, 'sections' => $sections, 'approvals' => $approvals]);
    }

    // DELETE /api/exams/requests/{id}
    public function destroyRequest(int $id)
    {
        DB::table('exam_requests')->where('id', $id)->delete();
        return response()->json(['success' => true]);
    }

    // POST /api/exams/requests/{id}/submit
    public function submitRequest(int $id, Request $request)
    {
        $exam = DB::table('exam_requests')->find($id);
        if (!$exam) return response()->json(['success' => false, 'error' => 'الطلب غير موجود'], 404);
        if (!in_array($exam->status, ['pending', 'draft'])) {
            return response()->json(['success' => false, 'error' => 'لا يمكن تقديم هذا الطلب في حالته الحالية'], 422);
        }

        $operatorName = $request->input('operator_name', 'Exam Coordinator');
        $operatorRole = $request->input('operator_role', 'admin');

        DB::table('exam_requests')->where('id', $id)->update(['status' => 'submitted']);
        DB::table('request_approvals')->insert([
            'request_id'      => $id,
            'request_type'    => 'exam_request',
            'reviewer_name'   => $operatorName,
            'reviewer_role'   => $operatorRole,
            'action'          => 'submitted',
            'previous_status' => $exam->status,
            'new_status'      => 'submitted',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        $this->auditLogService->log('request_submitted', 'exam_request', $id, [], [], $request->ip(), null, $operatorName, $operatorRole);
        return response()->json(['success' => true]);
    }

    // POST /api/exams/requests/{id}/approve
    public function approveRequest(int $id, Request $request)
    {
        $exam = DB::table('exam_requests')->find($id);
        if (!$exam) return response()->json(['success' => false, 'error' => 'الطلب غير موجود'], 404);

        $allowedFromStatuses = ['submitted', 'pending_department_approval', 'department_approved', 'pending_registrar_approval'];
        if (!in_array($exam->status, $allowedFromStatuses)) {
            return response()->json(['success' => false, 'error' => 'لا يمكن الموافقة على الطلب في حالته الحالية: ' . $exam->status], 422);
        }

        $reviewerName = $request->input('reviewer_name', 'Exam Coordinator');
        $reviewerRole = $request->input('reviewer_role', 'admin');
        $comment      = $request->input('comment', 'موافق');

        $statusMap = [
            'submitted'                   => 'pending_department_approval',
            'pending_department_approval' => 'department_approved',
            'department_approved'         => 'pending_registrar_approval',
            'pending_registrar_approval'  => 'registrar_approved',
        ];
        $newStatus = $statusMap[$exam->status] ?? 'registrar_approved';

        DB::table('exam_requests')->where('id', $id)->update(['status' => $newStatus]);
        DB::table('request_approvals')->insert([
            'request_id'      => $id,
            'request_type'    => 'exam_request',
            'reviewer_name'   => $reviewerName,
            'reviewer_role'   => $reviewerRole,
            'action'          => 'approved',
            'comment'         => $comment,
            'previous_status' => $exam->status,
            'new_status'      => $newStatus,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        $this->auditLogService->log('request_approved', 'exam_request', $id, ['status' => $exam->status], ['status' => $newStatus], $request->ip(), null, $reviewerName, $reviewerRole);
        return response()->json(['success' => true, 'new_status' => $newStatus]);
    }

    // POST /api/exams/requests/{id}/reject
    public function rejectRequest(int $id, Request $request)
    {
        $exam = DB::table('exam_requests')->find($id);
        if (!$exam) return response()->json(['success' => false, 'error' => 'الطلب غير موجود'], 404);
        if (in_array($exam->status, ['rejected', 'cancelled', 'scheduled'])) {
            return response()->json(['success' => false, 'error' => 'لا يمكن رفض الطلب في حالته الحالية'], 422);
        }

        $comment = trim($request->input('comment', ''));
        if (empty($comment)) {
            return response()->json(['success' => false, 'error' => 'يجب إدخال سبب الرفض'], 422);
        }

        $reviewerName = $request->input('reviewer_name', 'Exam Coordinator');
        $reviewerRole = $request->input('reviewer_role', 'admin');

        DB::table('exam_requests')->where('id', $id)->update(['status' => 'rejected']);
        DB::table('request_approvals')->insert([
            'request_id'      => $id,
            'request_type'    => 'exam_request',
            'reviewer_name'   => $reviewerName,
            'reviewer_role'   => $reviewerRole,
            'action'          => 'rejected',
            'comment'         => $comment,
            'previous_status' => $exam->status,
            'new_status'      => 'rejected',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        $this->auditLogService->log('request_rejected', 'exam_request', $id, ['status' => $exam->status], ['status' => 'rejected', 'reason' => $comment], $request->ip(), null, $reviewerName, $reviewerRole);
        return response()->json(['success' => true]);
    }

    // POST /api/exams/requests/{id}/cancel
    public function cancelRequest(int $id, Request $request)
    {
        $exam = DB::table('exam_requests')->find($id);
        if (!$exam) return response()->json(['success' => false, 'error' => 'الطلب غير موجود'], 404);
        if (in_array($exam->status, ['cancelled', 'scheduled'])) {
            return response()->json(['success' => false, 'error' => 'لا يمكن إلغاء الطلب في حالته الحالية'], 422);
        }

        $reviewerName = $request->input('reviewer_name', 'Exam Coordinator');
        $reviewerRole = $request->input('reviewer_role', 'admin');
        $comment      = $request->input('comment', 'ملغى');

        DB::table('exam_requests')->where('id', $id)->update(['status' => 'cancelled']);
        DB::table('request_approvals')->insert([
            'request_id'      => $id,
            'request_type'    => 'exam_request',
            'reviewer_name'   => $reviewerName,
            'reviewer_role'   => $reviewerRole,
            'action'          => 'cancelled',
            'comment'         => $comment,
            'previous_status' => $exam->status,
            'new_status'      => 'cancelled',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        $this->auditLogService->log('request_cancelled', 'exam_request', $id, [], [], $request->ip(), null, $reviewerName, $reviewerRole);
        return response()->json(['success' => true]);
    }

    // GET /api/exams/requests/{id}/approvals
    public function listApprovals(int $id)
    {
        $approvals = DB::table('request_approvals')
            ->where('request_id', $id)
            ->where('request_type', 'exam_request')
            ->orderBy('created_at')
            ->get();
        return response()->json(['approvals' => $approvals]);
    }

    // POST /api/exams/suggest-slot
    public function suggestSlot(Request $request)
    {
        $data   = $request->json()->all();
        $result = $this->availability->suggestExamSlots([
            'faculty'      => $data['faculty'] ?? null,
            'day'          => $data['day'] ?? null,
            'duration'     => isset($data['duration']) ? (int)$data['duration'] : null,
            'studentCount' => isset($data['studentCount']) ? (int)$data['studentCount'] : 0,
            'lecturer'     => $data['lecturer'] ?? null,
            'roomType'     => $data['roomType'] ?? 'room',
            'timeFrom'     => $data['timeFrom'] ?? null,
            'timeTo'       => $data['timeTo'] ?? null,
            'targetTimeFrom'=> $data['targetTimeFrom'] ?? null,
            'targetTimeTo' => $data['targetTimeTo'] ?? null,
            'targetDate'   => $data['targetDate'] ?? null,
            'examDate'     => $data['examDate'] ?? null, // factor in scheduled exams on this date
            'existingExamId'=> $data['existingExamId'] ?? null,
        ]);
        return response()->json($result);
    }

    // POST /api/exams/schedule
    public function schedule(Request $request)
    {
        $data = $request->json()->all();

        $operatorName = $data['operator_name'] ?? 'Exam Coordinator';
        $operatorRole = $data['operator_role'] ?? 'admin';
        
        $isFullDay = filter_var($data['is_full_day'] ?? false, FILTER_VALIDATE_BOOLEAN);

        // Normalize Dates
        $data['exam_date'] = $this->dateTimeNormalizationService->normalizeDate($data['exam_date'] ?? null);
        if (!$isFullDay) {
            $data['start_time'] = $this->dateTimeNormalizationService->normalizeTime($data['start_time'] ?? null);
            $data['end_time'] = $this->dateTimeNormalizationService->normalizeTime($data['end_time'] ?? null);
        } else {
            // For full day, we must have an exam date
            if (empty($data['exam_date'])) {
                return response()->json(['success' => false, 'message' => 'يرجى تحديد تاريخ الامتحان لحجز اليوم الكامل'], 400);
            }
            $data['start_time'] = '08:00:00'; // Default working hours
            $data['end_time']   = '18:00:00';
            if (empty($data['rooms']) && ($data['booking_scope'] ?? '') !== 'all_university') {
                return response()->json(['success' => false, 'message' => 'يجب تحديد القاعات أو اختيار حجز على مستوى الجامعة'], 400);
            }
        }

        // Validate Day vs Date
        $dayResult = $this->dateTimeNormalizationService->resolveDayAndDate($data['day'] ?? null, $data['exam_date']);
        $data['day'] = $dayResult['day'] ?? $data['day'] ?? null;
        $warning = $dayResult['warning'];

        if (empty($data['day']) || empty($data['start_time']) || empty($data['end_time'])) {
            return response()->json(['success' => false, 'message' => 'بيانات غير مكتملة: يجب توفير اليوم والوقت'], 400);
        }
        if (!$isFullDay && empty($data['rooms'])) {
             return response()->json(['success' => false, 'message' => 'بيانات غير مكتملة: يجب توفير القاعات'], 400);
        }
        if (empty($data['course_code'])) {
            return response()->json(['success' => false, 'message' => 'يجب تحديد كود المادة'], 400);
        }

        // Handle Force Replace Flow
        if (!empty($data['force_replace']) && !empty($data['replace_exam_ids'])) {
            DB::transaction(function () use ($data, $operatorName, $operatorRole) {
                $this->duplicateBookingService->replaceExistingExams(
                    $data['replace_exam_ids'],
                    $data['replacement_reason'] ?? 'تم استبدال الحجز بناءً على تأكيد المستخدم',
                    $operatorName,
                    $operatorRole
                );
            });
        }

        // Normalize + validate selected_sections
        $rawSections = $data['selected_sections'] ?? [];
        $sectionKeys = $this->extractSectionKeys($rawSections);

        if (empty($sectionKeys)) {
            return response()->json(['success' => false, 'message' => 'يجب تحديد شعبة واحدة على الأقل قبل الجدولة'], 400);
        }

        // Backend recalculates total students
        $resolved      = $this->courseSectionService->resolveSelectedSections($data['course_code'], $sectionKeys);
        $totalStudents = $resolved['total_students'];

        if ($totalStudents <= 0 && !$isFullDay) {
            return response()->json(['success' => false, 'message' => 'لم يتم احتساب عدد الطلاب من الشعب المحددة'], 400);
        }

        if ($isFullDay && !empty($data['expected_students'])) {
            $totalStudents = (int)$data['expected_students'];
        }

        // Check Duplicate Bookings
        if (empty($data['force_replace'])) {
            $duplicateCheck = $this->duplicateBookingService->findDuplicateCourseBooking($data);
            if (!$duplicateCheck['success']) {
                $this->auditLogService->log(
                    action: 'duplicate_booking_detected',
                    entityType: 'scheduled_exam',
                    entityId: null,
                    newValues: ['course_code' => $data['course_code'], 'duplicates' => $duplicateCheck['duplicate']],
                    ipAddress: $request->ip(),
                    operatorName: $operatorName,
                    operatorRole: $operatorRole
                );
                return response()->json($duplicateCheck, 409); // Return duplicate modal info
            }
        }

        // Build full conflict payload with backend-calculated values and resolved sections
        $conflictPayload = [
            'rooms'            => $data['rooms'] ?? [],
            'day'              => $data['day'],
            'exam_date'        => $data['exam_date'] ?? null,
            'start_time'       => $data['start_time'],
            'end_time'         => $data['end_time'],
            'duration_minutes' => $data['duration_minutes'] ?? 60,
            'student_count'    => $totalStudents,
            'lecturer'         => $data['lecturer'] ?? null,
            'course_code'      => $data['course_code'],
            'course_name'      => $data['course_name'] ?? null,
            'section'          => $data['section'] ?? null,
            'selected_sections'=> $resolved['sections'],
            'exclude_exam_id'  => $data['exclude_exam_id'] ?? null,
            'is_full_day'      => $isFullDay,
            'booking_scope'    => $data['booking_scope'] ?? null,
        ];

        $conflicts = $this->conflictService->getAllConflicts($conflictPayload);

        if (!empty($conflicts)) {
            $this->auditLogService->log(
                action: 'schedule_rejected',
                entityType: 'scheduled_exam',
                entityId: null,
                newValues: ['request' => array_diff_key($data, ['selected_sections' => true]), 'conflicts' => $conflicts],
                ipAddress: $request->ip(),
                operatorName: $operatorName,
                operatorRole: $operatorRole
            );
            return response()->json(['success' => false, 'message' => 'لا يمكن جدولة الاختبار بسبب تعارضات', 'conflicts' => $conflicts], 422);
        }

        // Insert inside transaction (race-condition safe)
        try {
            $operatorNameClosure = $operatorName;
            $operatorRoleClosure = $operatorRole;

            $examId = DB::transaction(function () use ($data, $resolved, $totalStudents, $isFullDay, $operatorNameClosure, $operatorRoleClosure) {
                // If this is a forced replacement, cancel the old exams first
                if (!empty($data['force_replace']) && !empty($data['existing_exam_ids'])) {
                    $this->duplicateBookingService->replaceExistingExams(
                        $data['existing_exam_ids'],
                        "تم استبدال الحجز بناءً على تأكيد المشغل لتغيير الموعد.",
                        $operatorNameClosure,
                        $operatorRoleClosure
                    );
                }

                // Re-check room conflicts inside transaction
                $innerConflicts = $this->conflictService->checkRoomConflicts([
                    'rooms'           => $data['rooms'] ?? [],
                    'day'             => $data['day'],
                    'exam_date'       => $data['exam_date'] ?? null,
                    'start_time'      => $data['start_time'],
                    'end_time'        => $data['end_time'],
                    'exclude_exam_id' => $data['exclude_exam_id'] ?? null,
                    'is_full_day'     => $isFullDay,
                    'booking_scope'   => $data['booking_scope'] ?? null,
                ]);
                if (!empty($innerConflicts)) {
                    throw new \RuntimeException('race_condition:' . json_encode($innerConflicts));
                }

                $id = DB::table('scheduled_exams')->insertGetId([
                    'exam_request_id'  => $data['exam_request_id'] ?? null,
                    'faculty'          => $data['faculty'] ?? null,
                    'day'              => $data['day'],
                    'exam_date'        => $data['exam_date'] ?? null,
                    'start_time'       => $data['start_time'],
                    'end_time'         => $data['end_time'],
                    'duration_minutes' => $data['duration_minutes'] ?? 60,
                    'lecturer'         => $data['lecturer'] ?? null,
                    'rooms_json'       => json_encode($data['rooms'] ?? []),
                    // Always compute total_capacity from the rooms table — never trust the request value
                    'total_capacity'   => DB::table('rooms')->whereIn('room_name', array_unique($data['rooms'] ?? []))->sum('capacity'),
                    'student_count'    => $totalStudents,
                    'course_code'      => $data['course_code'],
                    'course_name'      => $data['course_name'] ?? null,
                    'section'          => $data['section'] ?? null,
                    'notes'            => $data['notes'] ?? null,
                    'status'           => 'scheduled',
                    'is_full_day'      => $isFullDay,
                    'booking_scope'    => $data['booking_scope'] ?? null,
                    'exam_type'        => $data['exam_type'] ?? null,
                    'expected_students'=> $data['expected_students'] ?? null,
                    'academic_year'    => $data['academic_year'] ?? null,
                    'semester'         => $data['semester'] ?? null,
                    'exam_period'      => $data['exam_period'] ?? null,
                    'created_at'       => now(),
                    'updated_at'       => now(),
                ]);

                $rooms = array_unique($data['rooms'] ?? []);
                if ($isFullDay && ($data['booking_scope'] ?? '') === 'all_university') {
                    $rooms = DB::table('rooms')->pluck('room_name')->toArray();
                }

                // Distribute students across rooms
                $distribution = $this->roomDistributionService->distributeStudents($totalStudents, $rooms);
                foreach ($rooms as $room) {
                    $roomObj = DB::table('rooms')->where('room_name', $room)->first();
                    DB::table('scheduled_exam_rooms')->insert([
                        'scheduled_exam_id'       => $id,
                        'room_id'                 => $roomObj ? $roomObj->id : null,
                        'room_name'               => $room,
                        'assigned_students_count' => $distribution[$room] ?? 0,
                        'created_at'              => now(),
                        'updated_at'              => now(),
                    ]);
                }

                // Save sections pivot
                foreach ($resolved['sections'] as $sec) {
                    DB::table('scheduled_exam_sections')->insert([
                        'scheduled_exam_id' => $id,
                        'course_code'       => $data['course_code'],
                        'course_name'       => $data['course_name'] ?? '',
                        'section_key'       => $sec['section_key'],
                        'section_number'    => $sec['section_number'] ?? null,
                        'instructor_name'   => $sec['instructor_name'] ?? null,
                        'student_count'     => $sec['student_count'] ?? 0,
                        'metadata'          => json_encode(['instructors' => $sec['instructors'] ?? []]),
                        'created_at'        => now(),
                        'updated_at'        => now(),
                    ]);
                }

                // Update exam request status if linked
                if (!empty($data['exam_request_id'])) {
                    DB::table('exam_requests')->where('id', $data['exam_request_id'])->update(['status' => 'scheduled']);
                }

                return $id;
            });
        } catch (\RuntimeException $e) {
            if (str_starts_with($e->getMessage(), 'race_condition:')) {
                $raceConflicts = json_decode(substr($e->getMessage(), 15), true);
                return response()->json(['success' => false, 'message' => 'تعارض في الوقت الفعلي: تم حجز القاعة للتو', 'conflicts' => $raceConflicts], 409);
            }
            throw $e;
        }

        $exam = DB::table('scheduled_exams')->find($examId);

        $this->auditLogService->log(
            action: $isFullDay ? 'full_day_exam_scheduled' : 'exam_scheduled',
            entityType: 'scheduled_exam',
            entityId: $examId,
            newValues: (array) $exam,
            ipAddress: $request->ip(),
            operatorName: $operatorName,
            operatorRole: $operatorRole
        );

        return response()->json([
            'success' => true, 
            'exam' => $exam,
            'warning' => $warning
        ]);
    }

    // GET /api/exams/scheduled
    public function listScheduled(Request $request)
    {
        $query = DB::table('scheduled_exams')->where('status', '!=', 'cancelled');
        if ($faculty  = $request->query('faculty'))  $query->whereRaw('LOWER(faculty) = LOWER(?)', [$faculty]);
        if ($day      = $request->query('day'))      $query->whereRaw('LOWER(day) = LOWER(?)', [$day]);
        if ($course   = $request->query('course'))   $query->where('course_code', 'like', '%'.$course.'%');
        if ($status   = $request->query('status'))   $query->where('status', $status);
        if ($dateFrom = $request->query('date_from')) $query->where('exam_date', '>=', $dateFrom);
        if ($dateTo   = $request->query('date_to'))   $query->where('exam_date', '<=', $dateTo);

        $exams = $query->orderBy('exam_date')->orderBy('start_time')->get();
        $result = $exams->map(function ($e) {
            $e->rooms = json_decode($e->rooms_json ?? '[]', true) ?? [];
            return $e;
        });
        return response()->json(['exams' => $result]);
    }

    // GET /api/exams/scheduled/{id}
    public function showScheduled(int $id)
    {
        $exam = DB::table('scheduled_exams')->find($id);
        if (!$exam) return response()->json(['success' => false, 'error' => 'الاختبار غير موجود'], 404);
        $exam->rooms    = json_decode($exam->rooms_json ?? '[]', true) ?? [];
        $exam->sections = DB::table('scheduled_exam_sections')->where('scheduled_exam_id', $id)->get();
        $exam->rooms_detail = DB::table('scheduled_exam_rooms')->where('scheduled_exam_id', $id)->get();
        $approvals = [];
        if ($exam->exam_request_id) {
            $approvals = DB::table('request_approvals')->where('request_id', $exam->exam_request_id)->orderBy('created_at')->get();
        }
        $exam->approvals = $approvals;
        return response()->json(['exam' => $exam]);
    }

    // PUT /api/exams/scheduled/{id}
    public function updateScheduled(int $id, Request $request)
    {
        $exam = DB::table('scheduled_exams')->find($id);
        if (!$exam) return response()->json(['success' => false, 'error' => 'الاختبار غير موجود'], 404);

        $data = $request->json()->all();
        $operatorName = $data['operator_name'] ?? 'Exam Coordinator';
        $operatorRole = $data['operator_role'] ?? 'admin';

        $isFullDay = filter_var($data['is_full_day'] ?? $exam->is_full_day, FILTER_VALIDATE_BOOLEAN);

        // Normalize Dates
        $examDate  = $this->dateTimeNormalizationService->normalizeDate($data['exam_date'] ?? $exam->exam_date);
        $startTime = $isFullDay ? '08:00:00' : $this->dateTimeNormalizationService->normalizeTime($data['start_time'] ?? $exam->start_time);
        $endTime   = $isFullDay ? '18:00:00' : $this->dateTimeNormalizationService->normalizeTime($data['end_time'] ?? $exam->end_time);
        $rooms     = array_values(array_filter(array_unique(
            $data['rooms'] ?? json_decode($exam->rooms_json ?? '[]', true) ?? []
        )));

        $dayResult = $this->dateTimeNormalizationService->resolveDayAndDate($data['day'] ?? $exam->day, $examDate);
        $day = $dayResult['day'] ?? $exam->day;

        if (empty($day) || empty($startTime) || empty($endTime)) {
            return response()->json(['success' => false, 'message' => 'بيانات غير مكتملة: يجب توفير اليوم والوقت'], 400);
        }

        // Load selected sections from DB for the own-course exception
        $dbSections = DB::table('scheduled_exam_sections')
            ->where('scheduled_exam_id', $id)
            ->get()
            ->map(fn($s) => [
                'section_number' => $s->section_number,
                'section_key'    => $s->section_key,
                'course_code'    => $s->course_code,
            ])
            ->toArray();

        // Allow override from request (in case sections changed)
        $selectedSections = $data['selected_sections'] ?? $dbSections;

        // Run full conflict check using getBlockingConflicts (own-course lectures are non-blocking)
        $conflictPayload = [
            'rooms'             => $rooms,
            'day'               => $day,
            'exam_date'         => $examDate,
            'start_time'        => $startTime,
            'end_time'          => $endTime,
            'exclude_exam_id'   => $id,
            'is_full_day'       => $isFullDay,
            'booking_scope'     => $exam->booking_scope,
            'course_code'       => $exam->course_code,
            'course_name'       => $exam->course_name,
            'selected_sections' => $selectedSections,
            'selection_mode'    => $data['selection_mode'] ?? 'selected_sections',
            'lecturer'          => $data['instructor_name'] ?? $data['lecturer'] ?? $exam->lecturer,
            'student_count'     => (int)($data['student_count'] ?? $exam->student_count),
        ];

        $blockingConflicts = $this->conflictService->getBlockingConflicts($conflictPayload);
        $warnings = $this->conflictService->getWarnings($conflictPayload);

        if (!empty($blockingConflicts)) {
            return response()->json([
                'success'   => false,
                'message'   => 'لا يمكن تعديل الامتحان بسبب وجود تعارض',
                'conflicts' => $blockingConflicts,
                'warnings'  => $warnings,
            ], 409);
        }

        $oldValues = (array) $exam;

        // Extended editable fields
        $lecturer     = $data['instructor_name'] ?? $data['lecturer'] ?? $exam->lecturer;
        $studentCount = isset($data['student_count']) ? (int)$data['student_count'] : $exam->student_count;
        $notes        = $data['notes'] ?? $exam->notes;
        $status       = $data['status'] ?? $exam->status;
        $faculty      = $data['faculty'] ?? $exam->faculty;
        $examPeriod   = $data['exam_period'] ?? $exam->exam_period;

        // Determine source_type after edit
        $sourceType = $exam->source_type;
        if ($sourceType === 'import' || $sourceType === null) {
            // Keep import reference but mark as modified
            $sourceType = $exam->import_id ? 'import' : ($exam->source_type ?? 'manual');
        }

        DB::transaction(function () use ($id, $exam, $data, $day, $examDate, $startTime, $endTime, $rooms,
                                         $isFullDay, $lecturer, $studentCount, $notes, $status,
                                         $faculty, $examPeriod, $sourceType) {
            $totalCapacity = isset($data['capacity']) && (int)$data['capacity'] > 0
                ? (int)$data['capacity']
                : DB::table('rooms')->whereIn('room_name', array_unique($rooms))->sum('capacity');
            if ($totalCapacity === 0) {
                $totalCapacity = DB::table('rooms')->whereIn('room_name', array_unique($rooms))->sum('capacity');
            }

            DB::table('scheduled_exams')->where('id', $id)->update([
                'day'              => $day,
                'exam_date'        => $examDate,
                'start_time'       => $startTime,
                'end_time'         => $endTime,
                'rooms_json'       => json_encode($rooms),
                'total_capacity'   => $totalCapacity,
                'is_full_day'      => $isFullDay,
                'lecturer'         => $lecturer,
                'student_count'    => $studentCount,
                'notes'            => $notes,
                'status'           => $status,
                'faculty'          => $faculty,
                'exam_period'      => $examPeriod,
                'source_type'      => $sourceType,
                'updated_at'       => now(),
            ]);

            DB::table('scheduled_exam_rooms')->where('scheduled_exam_id', $id)->delete();

            $uniqueRooms = array_unique($rooms);
            if ($isFullDay && $exam->booking_scope === 'all_university') {
                $uniqueRooms = DB::table('rooms')->pluck('room_name')->toArray();
            }

            $distribution = $this->roomDistributionService->distributeStudents($studentCount, $uniqueRooms);
            foreach ($uniqueRooms as $room) {
                $roomObj = DB::table('rooms')->where('room_name', $room)->first();
                DB::table('scheduled_exam_rooms')->insert([
                    'scheduled_exam_id'       => $id,
                    'room_id'                 => $roomObj ? $roomObj->id : null,
                    'room_name'               => $room,
                    'assigned_students_count' => $distribution[$room] ?? 0,
                    'created_at'              => now(),
                    'updated_at'              => now(),
                ]);
            }
        });

        $this->auditLogService->log(
            action: 'exam_updated',
            entityType: 'scheduled_exam',
            entityId: $id,
            oldValues: $oldValues,
            newValues: [
                'exam_date'   => $examDate,
                'start_time'  => $startTime,
                'end_time'    => $endTime,
                'rooms'       => $rooms,
                'lecturer'    => $lecturer,
                'student_count' => $studentCount,
                'status'      => $status,
                'faculty'     => $faculty,
                'exam_period' => $examPeriod,
            ],
            ipAddress: $request->ip(),
            operatorName: $operatorName,
            operatorRole: $operatorRole
        );

        return response()->json([
            'success' => true,
            'message' => 'تم تحديث الامتحان بنجاح',
            'data'    => DB::table('scheduled_exams')->find($id),
        ]);
    }

    // DELETE /api/exams/scheduled/{id}
    public function destroyScheduled(int $id, Request $request)
    {
        $exam = DB::table('scheduled_exams')->find($id);
        if (!$exam) return response()->json(['success' => false, 'error' => 'الاختبار غير موجود'], 404);

        $oldValues = (array) $exam;

        DB::transaction(function () use ($id, $exam) {
            if ($exam->exam_request_id) {
                DB::table('exam_requests')->where('id', $exam->exam_request_id)->update(['status' => 'pending']);
            }
            DB::table('scheduled_exam_rooms')->where('scheduled_exam_id', $id)->delete();
            DB::table('scheduled_exam_sections')->where('scheduled_exam_id', $id)->delete();
            DB::table('scheduled_exams')->where('id', $id)->delete();
        });

        $operatorName = $request->input('operator_name', 'Exam Coordinator');
        $operatorRole = $request->input('operator_role', 'admin');

        $this->auditLogService->log(
            action: 'exam_cancelled',
            entityType: 'scheduled_exam',
            entityId: $id,
            oldValues: $oldValues,
            ipAddress: $request->ip(),
            operatorName: $operatorName,
            operatorRole: $operatorRole
        );

        return response()->json(['success' => true]);
    }

    // POST /api/exams/scheduled/{id}/reschedule
    public function rescheduleScheduled(int $id, Request $request)
    {
        $exam = DB::table('scheduled_exams')->find($id);
        if (!$exam) return response()->json(['success' => false, 'message' => 'الاختبار غير موجود'], 404);

        $data = $request->json()->all();
        $operatorName = $data['operator_name'] ?? 'Exam Coordinator';
        $operatorRole = $data['operator_role'] ?? 'admin';

        // Validate required fields
        if (empty($data['exam_date'])) {
            return response()->json(['success' => false, 'message' => 'التاريخ الجديد مطلوب'], 422);
        }
        if (empty($data['start_time'])) {
            return response()->json(['success' => false, 'message' => 'وقت البداية مطلوب'], 422);
        }
        if (empty($data['end_time'])) {
            return response()->json(['success' => false, 'message' => 'وقت النهاية مطلوب'], 422);
        }
        if (empty($data['rooms'])) {
            return response()->json(['success' => false, 'message' => 'القاعات مطلوبة'], 422);
        }
        $reason = trim($data['reason'] ?? '');
        if (empty($reason)) {
            return response()->json(['success' => false, 'message' => 'سبب إعادة الجدولة مطلوب'], 422);
        }

        // Normalize
        $examDate  = $this->dateTimeNormalizationService->normalizeDate($data['exam_date']);
        $startTime = $this->dateTimeNormalizationService->normalizeTime($data['start_time']);
        $endTime   = $this->dateTimeNormalizationService->normalizeTime($data['end_time']);
        $rooms     = array_values(array_filter(array_unique($data['rooms'])));

        $dayResult = $this->dateTimeNormalizationService->resolveDayAndDate(null, $examDate);
        $day       = $dayResult['day'] ?? null;

        if (!$examDate || !$startTime || !$endTime || !$day) {
            return response()->json(['success' => false, 'message' => 'بيانات التاريخ أو الوقت غير صالحة'], 422);
        }

        // Load selected sections from DB for own-course exception
        $dbSections = DB::table('scheduled_exam_sections')
            ->where('scheduled_exam_id', $id)
            ->get()
            ->map(fn($s) => ['section_number' => $s->section_number, 'section_key' => $s->section_key])
            ->toArray();

        // Conflict check using blocking-only (own-course lectures are non-blocking)
        $conflictPayload = [
            'rooms'             => $rooms,
            'day'               => $day,
            'exam_date'         => $examDate,
            'start_time'        => $startTime,
            'end_time'          => $endTime,
            'lecturer'          => $exam->lecturer,
            'course_code'       => $exam->course_code,
            'course_name'       => $exam->course_name,
            'student_count'     => $exam->student_count,
            'is_full_day'       => false,
            'exclude_exam_id'   => $id,
            'selected_sections' => $dbSections,
            'selection_mode'    => 'selected_sections',
        ];

        $blockingConflicts = $this->conflictService->getBlockingConflicts($conflictPayload);
        $warnings          = $this->conflictService->getWarnings($conflictPayload);

        if (!empty($blockingConflicts)) {
            return response()->json([
                'success'   => false,
                'message'   => 'لا يمكن إعادة الجدولة بسبب وجود تعارض',
                'conflicts' => $blockingConflicts,
                'warnings'  => $warnings,
            ], 409);
        }


        $oldValues = (array) $exam;

        DB::transaction(function () use ($id, $exam, $day, $examDate, $startTime, $endTime, $rooms) {
            $totalCapacity = DB::table('rooms')->whereIn('room_name', $rooms)->sum('capacity');
            $duration      = \Carbon\Carbon::parse($startTime)->diffInMinutes(\Carbon\Carbon::parse($endTime));

            DB::table('scheduled_exams')->where('id', $id)->update([
                'day'              => $day,
                'exam_date'        => $examDate,
                'start_time'       => $startTime,
                'end_time'         => $endTime,
                'duration_minutes' => $duration,
                'rooms_json'       => json_encode($rooms),
                'total_capacity'   => $totalCapacity,
                'source_type'      => 'rescheduled',
                'updated_at'       => now(),
            ]);

            DB::table('scheduled_exam_rooms')->where('scheduled_exam_id', $id)->delete();
            $distribution = $this->roomDistributionService->distributeStudents($exam->student_count, $rooms);
            foreach ($rooms as $room) {
                $roomObj = DB::table('rooms')->where('room_name', $room)->first();
                DB::table('scheduled_exam_rooms')->insert([
                    'scheduled_exam_id'       => $id,
                    'room_id'                 => $roomObj ? $roomObj->id : null,
                    'room_name'               => $room,
                    'assigned_students_count' => $distribution[$room] ?? 0,
                    'created_at'              => now(),
                    'updated_at'              => now(),
                ]);
            }
        });

        $this->auditLogService->log(
            action: 'exam_rescheduled',
            entityType: 'scheduled_exam',
            entityId: $id,
            oldValues: $oldValues,
            newValues: [
                'exam_date'  => $examDate,
                'start_time' => $startTime,
                'end_time'   => $endTime,
                'rooms'      => $rooms,
                'reason'     => $reason,
            ],
            ipAddress: $request->ip(),
            operatorName: $operatorName,
            operatorRole: $operatorRole
        );

        return response()->json([
            'success' => true,
            'message' => 'تمت إعادة جدولة الامتحان بنجاح',
            'data'    => DB::table('scheduled_exams')->find($id),
        ]);
    }

    // POST /api/exams/scheduled/{id}/cancel
    public function cancelScheduled(int $id, Request $request)
    {
        $exam = DB::table('scheduled_exams')->find($id);
        if (!$exam) return response()->json(['success' => false, 'message' => 'الاختبار غير موجود'], 404);
        if ($exam->status === 'cancelled') {
            return response()->json(['success' => false, 'message' => 'الاختبار ملغى مسبقاً'], 422);
        }

        $data         = $request->json()->all();
        $operatorName = $data['operator_name'] ?? 'Exam Coordinator';
        $operatorRole = $data['operator_role'] ?? 'admin';
        $reason       = trim($data['reason'] ?? 'إلغاء بواسطة المنسق');

        $oldValues = (array) $exam;

        DB::table('scheduled_exams')->where('id', $id)->update([
            'status'     => 'cancelled',
            'notes'      => $exam->notes ? $exam->notes . ' | إلغاء: ' . $reason : 'إلغاء: ' . $reason,
            'updated_at' => now(),
        ]);

        $this->auditLogService->log(
            action: 'exam_cancelled',
            entityType: 'scheduled_exam',
            entityId: $id,
            oldValues: $oldValues,
            newValues: ['status' => 'cancelled', 'reason' => $reason],
            ipAddress: $request->ip(),
            operatorName: $operatorName,
            operatorRole: $operatorRole
        );

        return response()->json([
            'success' => true,
            'message' => 'تم إلغاء الامتحان بنجاح',
        ]);
    }

    // GET /api/exams/scheduled/{id}/audit
    public function getAudit(int $id)
    {
        $exam = DB::table('scheduled_exams')->find($id);
        if (!$exam) return response()->json(['success' => false, 'message' => 'الاختبار غير موجود'], 404);

        $logs = DB::table('audit_logs')
            ->where('entity_type', 'scheduled_exam')
            ->where('entity_id', $id)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(function ($log) {
                $log->old_values = $log->old_values ? json_decode($log->old_values, true) : null;
                $log->new_values = $log->new_values ? json_decode($log->new_values, true) : null;
                return $log;
            });

        return response()->json(['success' => true, 'audit' => $logs]);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Extract section_key strings from either:
     *   - array of strings (old format)
     *   - array of objects with section_key field (new format)
     */
    private function extractSectionKeys(array $rawSections): array
    {
        $keys = [];
        foreach ($rawSections as $item) {
            if (is_string($item)) {
                $keys[] = $item;
            } elseif (is_array($item) && !empty($item['section_key'])) {
                $keys[] = $item['section_key'];
            }
        }
        return array_values(array_unique($keys));
    }

    // GET /api/exams/lecturers
    // Returns all unique lecturer names from parsed_sessions for use in dropdowns/autocomplete
    public function getLecturers()
    {
        $lecturers = DB::table('parsed_sessions as ps')
            ->join('uploaded_files as uf', 'ps.uploaded_file_id', '=', 'uf.id')
            ->where('uf.is_active', 1)
            ->whereNotNull('ps.lecturer')
            ->where('ps.lecturer', '!=', '')
            ->pluck('ps.lecturer')
            ->map(fn($l) => trim(preg_replace('/[\x{00A0}\s]+/u', ' ', $l)))
            ->filter()
            ->unique()
            ->sort()
            ->values();

        return response()->json(['lecturers' => $lecturers]);
    }
}
