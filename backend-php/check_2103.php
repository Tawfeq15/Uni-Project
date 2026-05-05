<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

echo "=== Sessions for room 2103 on Thursday ===\n";
$sessions = DB::select("
    SELECT ps.room, ps.day, ps.start_time, ps.end_time, ps.is_valid, uf.is_active, uf.original_name
    FROM parsed_sessions ps
    JOIN uploaded_files uf ON ps.uploaded_file_id = uf.id
    WHERE ps.room = '2103' AND LOWER(ps.day) = 'thursday'
    LIMIT 50
");
if (empty($sessions)) {
    echo "NO sessions found for room 2103 on Thursday\n";
} else {
    foreach ($sessions as $s) {
        echo "  room={$s->room} day={$s->day} start={$s->start_time} end={$s->end_time} is_valid={$s->is_valid} is_active={$s->is_active} file={$s->original_name}\n";
    }
}

echo "\n=== All distinct days for room 2103 ===\n";
$days = DB::select("
    SELECT DISTINCT ps.day, ps.is_valid, uf.is_active
    FROM parsed_sessions ps
    JOIN uploaded_files uf ON ps.uploaded_file_id = uf.id
    WHERE ps.room = '2103'
");
foreach ($days as $d) {
    echo "  day={$d->day} is_valid={$d->is_valid} is_active={$d->is_active}\n";
}

echo "\n=== Free slots computed by OccupancyService for 2103/thursday ===\n";
$occService = app(App\Services\OccupancyService::class);
$result = $occService->getRoomFreeSlots('2103', 'thursday');
echo "Occupied: " . json_encode($result['occupied']) . "\n";
echo "Free: " . json_encode($result['free']) . "\n";

echo "\n=== Scheduled exams on thursday for 2103 ===\n";
$exams = DB::select("
    SELECT se.start_time, se.end_time, se.rooms_json, se.status, se.course_code
    FROM scheduled_exams se
    WHERE LOWER(se.day) = 'thursday'
    AND se.status != 'cancelled'
");
foreach ($exams as $e) {
    $rooms = json_decode($e->rooms_json ?? '[]', true) ?? [];
    if (in_array('2103', $rooms)) {
        echo "  EXAM: {$e->course_code} {$e->start_time}-{$e->end_time} rooms=" . implode(',', $rooms) . "\n";
    }
}
echo "Done.\n";
