<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

echo "=== Conflict group 601112 details ===\n";
$groups = DB::table('exam_conflict_groups')->where('title', 'LIKE', '%601112%')->get();
foreach ($groups as $g) {
    echo "  ID={$g->id} title={$g->title} status={$g->status}\n";
    echo "  desc=" . substr($g->description, 0, 300) . "\n";
    
    $items = DB::table('exam_conflict_items')->where('conflict_group_id', $g->id)->get();
    foreach ($items as $item) {
        echo "  Item: course={$item->course_code} date={$item->exam_date} time={$item->start_time}-{$item->end_time}\n";
    }
}

echo "\n=== Working hours check for 10:45-11:05 ===\n";
$start = "10:45";
$end = "11:05";
$workStart = 480; // 08:00
$workEnd = intval(substr(env('EXAM_WORK_END', '16:00'), 0, 2)) * 60;
$startMin = (int)substr($start, 0, 2) * 60 + (int)substr($start, 3, 2);
$endMin = (int)substr($end, 0, 2) * 60 + (int)substr($end, 3, 2);
echo "  workStart={$workStart}, workEnd={$workEnd}\n";
echo "  examStart={$startMin} ({$start}), examEnd={$endMin} ({$end})\n";
echo "  startMin < workStart: " . ($startMin < $workStart ? 'YES' : 'NO') . "\n";
echo "  endMin > workEnd: " . ($endMin > $workEnd ? 'YES' : 'NO') . "\n";
echo "  Result: " . (($startMin < $workStart || $endMin > $workEnd) ? 'OUTSIDE HOURS' : 'WITHIN HOURS') . "\n";
