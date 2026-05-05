<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$exams = \Illuminate\Support\Facades\DB::table('scheduled_exams')
    ->where('rooms_json', 'like', '%2101%')
    ->get();

foreach ($exams as $e) {
    echo "Exam on {$e->day} {$e->exam_date} | {$e->start_time} - {$e->end_time} | Status: {$e->status}\n";
}
