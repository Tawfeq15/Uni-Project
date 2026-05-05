<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

$exams = Illuminate\Support\Facades\DB::table('scheduled_exams')
    ->where('exam_date', '2026-05-04')
    ->get();

echo json_encode($exams, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
