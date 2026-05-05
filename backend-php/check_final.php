<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

echo "=== Group 9400109 items (from conflict_items) ===\n";
$groups = DB::table('exam_conflict_groups')->where('title', 'LIKE', '%9400109%')->get();
foreach ($groups as $g) {
    echo "Group ID={$g->id} status={$g->status}\n";
    $items = DB::table('exam_conflict_items')->where('conflict_group_id', $g->id)->get();
    foreach ($items as $item) {
        echo "  Item {$item->id}: {$item->course_code} {$item->exam_date} {$item->start_time}-{$item->end_time} status={$item->action_status}\n";
    }
}

echo "\n=== All conflict items with times outside 08:00-16:00 ===\n";
$items = DB::table('exam_conflict_items')
    ->whereNotNull('start_time')
    ->whereNotNull('end_time')
    ->get();

$bad = 0;
foreach ($items as $item) {
    $startH = (int)substr($item->start_time, 0, 2);
    $endH   = (int)substr($item->end_time, 0, 2);
    if ($startH < 8 || $endH > 16 || $startH > $endH) {
        echo "  Item {$item->id}: {$item->course_code} {$item->start_time}-{$item->end_time}\n";
        $bad++;
    }
}
echo "Total items with time issues: {$bad}\n";
