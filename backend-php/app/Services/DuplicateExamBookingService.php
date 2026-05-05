<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class DuplicateExamBookingService
{
    /**
     * Check if the course code and sections are already booked.
     * 
     * @return array { success: bool, message: string, duplicate: array|null, ... }
     */
    public function findDuplicateCourseBooking(array $data): array
    {
        $courseCode = $data['course_code'] ?? null;
        $term       = $data['academic_term'] ?? null;
        $period     = $data['exam_period'] ?? null;
        $sections   = $data['selected_sections'] ?? []; // array of section_key or objects

        if (!$courseCode || empty($sections)) {
            return ['success' => true];
        }

        $sectionKeys = $this->extractSectionKeys($sections);

        // Find all active scheduled_exam_sections for this course
        $query = DB::table('scheduled_exam_sections as ses')
            ->join('scheduled_exams as se', 'se.id', '=', 'ses.scheduled_exam_id')
            ->select('se.*', 'ses.section_key', 'ses.section_number')
            ->where('ses.course_code', $courseCode)
            ->whereIn('se.status', ['scheduled', 'active', 'approved']);

        if ($term) {
            $query->where('se.academic_term', $term);
        }
        if ($period) {
            $query->where('se.exam_period', $period);
        }

        if (!empty($data['exclude_exam_id'])) {
            $query->where('se.id', '!=', $data['exclude_exam_id']);
        }

        $existingBookings = $query->get();

        if ($existingBookings->isEmpty()) {
            return ['success' => true];
        }

        // Filter to see if any requested sections are already booked
        $duplicateSections = [];
        $existingExamIds = [];
        $existingExams = [];

        foreach ($existingBookings as $booking) {
            if (in_array($booking->section_key, $sectionKeys)) {
                $duplicateSections[] = $booking->section_number ?? $booking->section_key;
                
                if (!in_array($booking->id, $existingExamIds)) {
                    $existingExamIds[] = $booking->id;
                    $existingExams[] = [
                        'id'         => $booking->id,
                        'date'       => $booking->exam_date,
                        'day'        => $booking->day,
                        'start_time' => $booking->start_time,
                        'end_time'   => $booking->end_time,
                        'rooms'      => json_decode($booking->rooms_json ?? '[]'),
                        // Find all sections tied to this specific exam
                        'sections'   => DB::table('scheduled_exam_sections')
                                            ->where('scheduled_exam_id', $booking->id)
                                            ->pluck('section_number')
                                            ->toArray(),
                    ];
                }
            }
        }

        if (empty($duplicateSections)) {
            return ['success' => true];
        }

        return [
            'success' => false,
            'requires_replacement_confirmation' => true,
            'message' => 'هذه المادة أو بعض شعبها محجوزة مسبقًا. هل تريد الاستبدال؟',
            'duplicate' => [
                'type'               => 'duplicate_course_exam',
                'course_code'        => $courseCode,
                'course_name'        => $data['course_name'] ?? '',
                'existing_exam_ids'  => $existingExamIds,
                'duplicate_sections' => array_values(array_unique($duplicateSections)),
                'existing_exams'     => $existingExams,
            ]
        ];
    }

    /**
     * Replace existing exams with the new one.
     * This marks the old exams as 'replaced' (or 'cancelled' if 'replaced' is not a valid enum depending on DB schema).
     */
    public function replaceExistingExams(array $examIds, string $reason, string $operatorName, string $operatorRole): void
    {
        if (empty($examIds)) return;

        $auditLogService = app(AuditLogService::class);

        foreach ($examIds as $id) {
            $oldExam = DB::table('scheduled_exams')->find($id);
            if (!$oldExam) continue;

            $oldValues = (array) $oldExam;

            // We use 'cancelled' as the status because it's already supported in the schema, 
            // but we add a note for 'replaced'
            DB::table('scheduled_exams')
                ->where('id', $id)
                ->update([
                    'status' => 'cancelled',
                    'notes' => trim($oldExam->notes . "\n[REPLACED] " . $reason),
                    'updated_at' => now()
                ]);

            if ($oldExam->exam_request_id) {
                // Return request to pending or update its status appropriately
                DB::table('exam_requests')
                    ->where('id', $oldExam->exam_request_id)
                    ->update(['status' => 'pending']);
            }

            // Unlink rooms from the replaced exam
            DB::table('scheduled_exam_rooms')->where('scheduled_exam_id', $id)->delete();
            // We keep scheduled_exam_sections attached so history shows what was replaced

            $auditLogService->log(
                action: 'exam_replaced',
                entityType: 'scheduled_exam',
                entityId: $id,
                oldValues: $oldValues,
                newValues: ['status' => 'cancelled', 'reason' => $reason],
                ipAddress: request()->ip() ?? '127.0.0.1',
                operatorName: $operatorName,
                operatorRole: $operatorRole
            );
        }
    }

    /**
     * Extract section keys.
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
}
