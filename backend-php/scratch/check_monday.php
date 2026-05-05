<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

// Check what dates are stored for Monday exams
$exams = Illuminate\Support\Facades\DB::table('scheduled_exams')
    ->where('day', 'monday')
    ->select('id', 'course_name', 'exam_date', 'start_time', 'end_time', 'status')
    ->orderBy('exam_date')
    ->get();

echo json_encode($exams, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
