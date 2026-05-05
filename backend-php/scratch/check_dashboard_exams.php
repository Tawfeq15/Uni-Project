<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

$names = ['علم الأدوية (2)', 'التغذية العلاجية (2)', 'الصيدلانيات', 'المداواة 2'];
$exams = Illuminate\Support\Facades\DB::table('scheduled_exams')
    ->whereIn('course_name', $names)
    ->get();

echo json_encode($exams, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
