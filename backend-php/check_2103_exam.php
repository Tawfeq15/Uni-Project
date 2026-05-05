<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

echo "=== All scheduled exams involving 2103 ===\n";
$exams = DB::select("SELECT se.id, se.course_code, se.day, se.exam_date, se.start_time, se.end_time, se.status, se.rooms_json FROM scheduled_exams se WHERE se.status != 'cancelled'");
foreach ($exams as $e) {
    $rooms = json_decode($e->rooms_json ?? '[]', true) ?? [];
    if (in_array('2103', $rooms)) {
        echo "  ID={$e->id} course={$e->course_code} day={$e->day} date={$e->exam_date} {$e->start_time}-{$e->end_time} status={$e->status}\n";
    }
}

echo "\n=== Conflict groups mentioning 2103 ===\n";
$groups = DB::select("SELECT cg.title, cg.description, cg.status FROM exam_conflict_groups cg WHERE cg.description LIKE '%2103%' OR cg.title LIKE '%2103%' LIMIT 10");
foreach ($groups as $g) {
    echo "  title={$g->title} status={$g->status}\n  desc={$g->description}\n";
}

echo "\n=== Conflict items mentioning 2103 ===\n";
$items = DB::select("SELECT ci.course_code, ci.exam_date, ci.start_time, ci.end_time, ci.room_names, ci.action_status FROM exam_conflict_items ci WHERE ci.room_names LIKE '%2103%' LIMIT 10");
foreach ($items as $i) {
    echo "  {$i->course_code} {$i->exam_date} {$i->start_time}-{$i->end_time} rooms={$i->room_names} action={$i->action_status}\n";
}
