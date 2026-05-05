<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class InvigilatorService
{
    /**
     * Determine the number of invigilators needed based on student count.
     * Example logic: 1 invigilator per 30 students, minimum 1.
     */
    public function calculateRequiredInvigilators(int $studentCount): int
    {
        if ($studentCount <= 0) return 0;
        return max(1, (int) ceil($studentCount / 30));
    }

    /**
     * Find available invigilators for a given time slot.
     */
    public function findAvailableInvigilators(string $date, string $startTime, string $endTime, int $requiredCount = 1): array
    {
        // For V1, we simply get invigilators who don't have overlapping exams.
        // We can check the `exam_invigilators` table joined with `scheduled_exams`.

        $busyInvigilatorIds = DB::table('exam_invigilators')
            ->join('scheduled_exams', 'exam_invigilators.scheduled_exam_id', '=', 'scheduled_exams.id')
            ->where('scheduled_exams.exam_date', $date)
            ->where('scheduled_exams.status', '!=', 'cancelled')
            ->where(function ($q) use ($startTime, $endTime) {
                // Overlap condition
                $q->where('scheduled_exams.start_time', '<', $endTime)
                  ->where('scheduled_exams.end_time', '>', $startTime);
            })
            ->pluck('exam_invigilators.invigilator_id');

        $available = DB::table('invigilators')
            ->where('status', 'active')
            ->whereNotIn('id', $busyInvigilatorIds)
            ->take($requiredCount)
            ->get();

        return $available->toArray();
    }

    /**
     * Auto-assign invigilators to a scheduled exam.
     */
    public function assignInvigilators(int $examId, int $studentCount, string $date, string $startTime, string $endTime): array
    {
        $required = $this->calculateRequiredInvigilators($studentCount);
        $available = $this->findAvailableInvigilators($date, $startTime, $endTime, $required);

        $assigned = [];
        foreach ($available as $inv) {
            DB::table('exam_invigilators')->insert([
                'scheduled_exam_id' => $examId,
                'invigilator_id' => $inv->id,
                'role' => 'invigilator',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $assigned[] = $inv->name;
        }

        return $assigned;
    }
}
