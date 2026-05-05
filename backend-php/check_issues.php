<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

echo "=== Room 2103 info in rooms table ===\n";
$room = DB::table('rooms')->where('room_name', '2103')->first();
if ($room) {
    echo "  room_name={$room->room_name} room_type={$room->room_type} capacity={$room->capacity} faculty={$room->faculty} is_active={$room->is_active}\n";
} else {
    echo "  NOT FOUND in rooms table!\n";
}

echo "\n=== EXAM_WORK_END env value ===\n";
echo "  EXAM_WORK_START=" . env('EXAM_WORK_START', '08:00') . "\n";
echo "  EXAM_WORK_END=" . env('EXAM_WORK_END', '18:00') . "\n";

echo "\n=== Check if 1:00PM exam (13:00-14:00) is considered outside hours ===\n";
$workStart = 480; // 8:00
$workEndOccupancy = 960; // 16:00
$workEndConflict = intval(substr(env('EXAM_WORK_END', '18:00'), 0, 2)) * 60 + intval(substr(env('EXAM_WORK_END', '18:00'), 3, 2));
echo "  OccupancyService WORK_END = {$workEndOccupancy} min = " . ($workEndOccupancy/60) . ":00\n";
echo "  ConflictService EXAM_WORK_END = {$workEndConflict} min = " . ($workEndConflict/60) . ":00\n";

$examStart = 780; // 13:00
$examEnd = 840;   // 14:00
echo "\n  Exam 13:00-14:00 vs ConflictService({$workStart}-{$workEndConflict}):\n";
echo "  startMin($examStart) < workStart($workStart): " . ($examStart < $workStart ? 'YES-violation' : 'ok') . "\n";
echo "  endMin($examEnd) > workEnd($workEndConflict): " . ($examEnd > $workEndConflict ? 'YES-violation' : 'ok') . "\n";
echo "  => conflict: " . (($examStart < $workStart || $examEnd > $workEndConflict) ? "YES - OUTSIDE HOURS" : "NO - within hours") . "\n";
