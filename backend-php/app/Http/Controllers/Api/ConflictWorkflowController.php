<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Services\AuditLogService;
use App\Services\SchedulingConflictService;
use Illuminate\Support\Facades\Log;

class ConflictWorkflowController extends Controller
{
    public function __construct(
        protected SchedulingConflictService $conflictService,
        protected AuditLogService $auditLogService
    ) {}

    // Get conflict groups specifically for the new import workflow
    public function getImportConflicts()
    {
        $groups = DB::table('exam_conflict_groups')->orderByDesc('id')->get();
        
        foreach ($groups as $g) {
            $g->items = DB::table('exam_conflict_items')
                ->where('conflict_group_id', $g->id)
                ->get();
        }

        return response()->json([
            'success' => true,
            'groups' => $groups
        ]);
    }

    public function approveItem(Request $request, $id, $itemId)
    {
        $item = DB::table('exam_conflict_items')->where('id', $itemId)->where('conflict_group_id', $id)->first();
        if (!$item) return response()->json(['success' => false, 'message' => 'Not found'], 404);

        $group = DB::table('exam_conflict_groups')->where('id', $id)->first();

        // Check if item is already approved
        if ($item->action_status === 'approved') {
            return response()->json(['success' => false, 'message' => 'Already approved']);
        }

        DB::beginTransaction();
        try {
            // Get original import row to find the faculty and other metadata
            $importRow = DB::table('exam_schedule_import_rows')->where('id', $item->import_row_id)->first();
            $faculty = $importRow ? $importRow->faculty : 'Unknown';
            $academicYear = $importRow ? $importRow->academic_year : null;
            $semester = $importRow ? $importRow->semester : null;
            $examPeriod = $importRow ? $importRow->exam_period : null;

            // Insert into scheduled_exams
            $rooms      = json_decode($item->room_names, true) ?? [];
            $totalCap   = DB::table('rooms')->whereIn('room_name', array_unique($rooms))->sum('capacity');

            $examId = DB::table('scheduled_exams')->insertGetId([
                'faculty'          => $faculty,
                'academic_year'    => $academicYear,
                'semester'         => $semester,
                'exam_period'      => $examPeriod,
                'day'              => DB::table('exam_schedule_import_rows')->where('id', $item->import_row_id)->value('day'),
                'exam_date'        => $item->exam_date,
                'start_time'       => $item->start_time,
                'end_time'         => $item->end_time,
                'duration_minutes' => \Carbon\Carbon::parse($item->end_time)->diffInMinutes(\Carbon\Carbon::parse($item->start_time)),
                'lecturer'         => $item->instructor_name,
                'rooms_json'       => $item->room_names,
                'total_capacity'   => $totalCap,
                'student_count'    => $item->student_count ?? 0,
                'course_code'      => $item->course_code,
                'course_name'      => $item->course_name,
                'status'           => 'scheduled',
                'created_at'       => now(),
                'updated_at'       => now(),
            ]);

            // Rooms
            foreach ($rooms as $room) {
                $roomObj = DB::table('rooms')->where('room_name', $room)->first();
                DB::table('scheduled_exam_rooms')->insert([
                    'scheduled_exam_id' => $examId,
                    'room_id'           => $roomObj ? $roomObj->id : null,
                    'room_name'         => $room,
                    'created_at'        => now(),
                ]);
            }

            // Sections
            $sections = explode(',', $item->section_number);
            foreach ($sections as $sec) {
                if (empty(trim($sec))) continue;
                DB::table('scheduled_exam_sections')->insert([
                    'scheduled_exam_id' => $examId,
                    'course_code'       => $item->course_code,
                    'course_name'       => $item->course_name,
                    'section_key'       => trim($sec),
                    'section_number'    => trim($sec),
                    'instructor_name'   => $item->instructor_name,
                    'created_at'        => now(),
                ]);
            }

            // Update item
            DB::table('exam_conflict_items')->where('id', $itemId)->update([
                'action_status' => 'approved',
                'scheduled_exam_id' => $examId,
                'updated_at' => now()
            ]);

            // Set all other items in the group to needs_reschedule if they are pending
            DB::table('exam_conflict_items')
                ->where('conflict_group_id', $id)
                ->where('id', '!=', $itemId)
                ->where('action_status', 'pending_review')
                ->update(['action_status' => 'needs_reschedule', 'updated_at' => now()]);

            // Check if group is resolved
            $unresolved = DB::table('exam_conflict_items')
                ->where('conflict_group_id', $id)
                ->whereIn('action_status', ['pending_review', 'needs_reschedule'])
                ->count();
            
            if ($unresolved === 0) {
                DB::table('exam_conflict_groups')->where('id', $id)->update(['status' => 'resolved']);
            } else {
                DB::table('exam_conflict_groups')->where('id', $id)->update(['status' => 'partially_resolved']);
            }

            $this->auditLogService->log(
                action: 'conflict_item_approved',
                entityType: 'exam_conflict_item',
                entityId: $itemId,
                newValues: ['scheduled_exam_id' => $examId],
                ipAddress: $request->ip(),
                operatorName: 'Exam Coordinator',
                operatorRole: 'admin'
            );

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'تم اعتماد المادة الأولى، ويجب إعادة جدولة المادة الأخرى (إن وجدت).'
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error("Approve item failed: " . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'حدث خطأ أثناء الاعتماد']);
        }
    }

    public function rejectItem(Request $request, $id, $itemId)
    {
        $item = DB::table('exam_conflict_items')->where('id', $itemId)->where('conflict_group_id', $id)->first();
        if (!$item) return response()->json(['success' => false, 'message' => 'Not found'], 404);

        DB::table('exam_conflict_items')->where('id', $itemId)->update([
            'action_status' => 'rejected',
            'updated_at' => now()
        ]);

        $unresolved = DB::table('exam_conflict_items')
            ->where('conflict_group_id', $id)
            ->whereIn('action_status', ['pending_review', 'needs_reschedule'])
            ->count();
        
        if ($unresolved === 0) {
            DB::table('exam_conflict_groups')->where('id', $id)->update(['status' => 'resolved']);
        }

        return response()->json(['success' => true, 'message' => 'تم رفض المادة.']);
    }

    public function rescheduleItem(Request $request, $id, $itemId)
    {
        $item = DB::table('exam_conflict_items')->where('id', $itemId)->where('conflict_group_id', $id)->first();
        if (!$item) return response()->json(['success' => false, 'message' => 'Not found'], 404);

        $request->validate([
            'exam_date' => 'required|date',
            'start_time' => 'required',
            'end_time' => 'required',
            'rooms' => 'required|array',
        ]);

        $importRow = DB::table('exam_schedule_import_rows')->where('id', $item->import_row_id)->first();
        
        $data = [
            'course_code'       => $item->course_code,
            'course_name'       => $item->course_name,
            'faculty'           => $importRow ? $importRow->faculty : 'Unknown',
            'academic_year'     => $importRow ? $importRow->academic_year : null,
            'semester'          => $importRow ? $importRow->semester : null,
            'exam_period'       => $importRow ? $importRow->exam_period : null,
            'exam_date'         => $request->exam_date,
            'day'               => \Carbon\Carbon::parse($request->exam_date)->englishDayOfWeek,
            'start_time'        => $request->start_time,
            'end_time'          => $request->end_time,
            'duration_minutes'  => \Carbon\Carbon::parse($request->end_time)->diffInMinutes(\Carbon\Carbon::parse($request->start_time)),
            'student_count'     => $item->student_count,
            'rooms'             => $request->rooms,
            'lecturer'          => $item->instructor_name,
            'selected_sections' => explode(',', $item->section_number),
            'is_full_day'       => false,
        ];

        // Check for conflicts with the NEW proposed time
        $sysConflicts = $this->conflictService->getAllConflicts($data);
        if (!empty($sysConflicts)) {
            return response()->json([
                'success' => false,
                'message' => 'لا يزال يوجد تعارض في الوقت/القاعة المحددة الجديدة.',
                'conflicts' => $sysConflicts
            ]);
        }

        DB::beginTransaction();
        try {
            // Valid! Insert
            $newRooms   = array_unique($data['rooms']);
            $totalCap   = DB::table('rooms')->whereIn('room_name', $newRooms)->sum('capacity');

            $examId = DB::table('scheduled_exams')->insertGetId([
                'faculty'          => $data['faculty'],
                'academic_year'    => $data['academic_year'],
                'semester'         => $data['semester'],
                'exam_period'      => $data['exam_period'],
                'day'              => $data['day'],
                'exam_date'        => $data['exam_date'],
                'start_time'       => $data['start_time'],
                'end_time'         => $data['end_time'],
                'duration_minutes' => $data['duration_minutes'],
                'lecturer'         => $data['lecturer'],
                'rooms_json'       => json_encode($data['rooms']),
                'total_capacity'   => $totalCap,
                'student_count'    => $data['student_count'] ?? 0,
                'course_code'      => $data['course_code'],
                'course_name'      => $data['course_name'],
                'status'           => 'scheduled',
                'created_at'       => now(),
                'updated_at'       => now(),
            ]);

            // Rooms
            foreach ($data['rooms'] as $room) {
                $roomObj = DB::table('rooms')->where('room_name', $room)->first();
                DB::table('scheduled_exam_rooms')->insert([
                    'scheduled_exam_id' => $examId,
                    'room_id'           => $roomObj ? $roomObj->id : null,
                    'room_name'         => $room,
                    'created_at'        => now(),
                ]);
            }

            // Sections
            foreach ($data['selected_sections'] as $sec) {
                if (empty(trim($sec))) continue;
                DB::table('scheduled_exam_sections')->insert([
                    'scheduled_exam_id' => $examId,
                    'course_code'       => $item->course_code,
                    'course_name'       => $item->course_name,
                    'section_key'       => trim($sec),
                    'section_number'    => trim($sec),
                    'instructor_name'   => $item->instructor_name,
                    'created_at'        => now(),
                ]);
            }

            // Update item
            DB::table('exam_conflict_items')->where('id', $itemId)->update([
                'action_status' => 'rescheduled',
                'resolution_note' => $request->notes,
                'scheduled_exam_id' => $examId,
                'updated_at' => now()
            ]);

            // Check if group is resolved
            $unresolved = DB::table('exam_conflict_items')
                ->where('conflict_group_id', $id)
                ->whereIn('action_status', ['pending_review', 'needs_reschedule'])
                ->count();
            
            if ($unresolved === 0) {
                DB::table('exam_conflict_groups')->where('id', $id)->update(['status' => 'resolved']);
            }

            $this->auditLogService->log(
                action: 'conflict_item_rescheduled',
                entityType: 'exam_conflict_item',
                entityId: $itemId,
                newValues: ['scheduled_exam_id' => $examId],
                ipAddress: $request->ip(),
                operatorName: 'Exam Coordinator',
                operatorRole: 'admin'
            );

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'تمت إعادة الجدولة واعتماد الاختبار بنجاح.'
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error("Reschedule item failed: " . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'حدث خطأ أثناء إعادة الجدولة']);
        }
    }

    public function ignoreWarning(Request $request, $id)
    {
        DB::table('exam_conflict_groups')->where('id', $id)->update(['status' => 'ignored']);
        return response()->json(['success' => true, 'message' => 'تم تجاهل التحذير']);
    }
}
