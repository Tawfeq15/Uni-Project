<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

$requests = Illuminate\Support\Facades\DB::table('exam_requests')
    ->where('course_name', 'like', '%غذاء%')
    ->get();

echo json_encode($requests, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
