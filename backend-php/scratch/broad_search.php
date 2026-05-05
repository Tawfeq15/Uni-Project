<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

$exams = Illuminate\Support\Facades\DB::table('scheduled_exams')
    ->where('course_name', 'like', '%غذاء%')
    ->orWhere('course_name', 'like', '%أغذية%')
    ->orWhere('course_name', 'like', '%صيدلانية%')
    ->get();

echo json_encode($exams, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
