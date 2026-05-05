<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

echo "=== Updating conflict group descriptions to reflect corrected times ===\n";

$groups = DB::table('exam_conflict_groups')->get();
$updated = 0;

foreach ($groups as $group) {
    // Get all items for this group with their current (corrected) times
    $items = DB::table('exam_conflict_items')
        ->where('conflict_group_id', $group->id)
        ->get();

    if ($items->isEmpty()) continue;

    // Rebuild description from current conflict items' system conflicts
    // We regenerate from the conflict items themselves
    $conflictSvc = app(App\Services\SchedulingConflictService::class);
    
    $descriptions = [];
    foreach ($items as $item) {
        $rooms = json_decode($item->room_names ?? '[]', true) ?? [];
        $importRow = DB::table('exam_schedule_import_rows')->where('id', $item->import_row_id)->first();
        $day = $importRow ? $importRow->day : null;
        
        if ($item->start_time && $item->end_time && $day && !empty($rooms)) {
            $data = [
                'rooms' => $rooms,
                'day' => $day,
                'exam_date' => $item->exam_date,
                'start_time' => substr($item->start_time, 0, 5),
                'end_time' => substr($item->end_time, 0, 5),
                'is_full_day' => false,
                'duration_minutes' => 60,
                'student_count' => $item->student_count ?? 0,
                'lecturer' => $item->instructor_name,
                'course_code' => $item->course_code,
            ];
            
            try {
                $conflicts = $conflictSvc->getAllConflicts($data);
                foreach ($conflicts as $c) {
                    $descriptions[] = $c['message'];
                }
            } catch (\Throwable $e) {
                // ignore
            }
        }
    }
    
    if (!empty($descriptions)) {
        $newDesc = implode(' | ', array_unique($descriptions));
        DB::table('exam_conflict_groups')->where('id', $group->id)->update([
            'description' => substr($newDesc, 0, 2000),
        ]);
        $updated++;
    }
}

echo "Updated {$updated} conflict group descriptions.\n";
echo "Done!\n";
