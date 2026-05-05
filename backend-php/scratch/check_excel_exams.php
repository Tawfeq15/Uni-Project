<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

$names = ['مقدمة في علم الغذاء', 'تكنولوجيا الأغذية', 'تكنولوجيا الأغذية المتقدمة', 'حسابات وتركيب الأشكال الصيدلانية'];
$exams = Illuminate\Support\Facades\DB::table('scheduled_exams')
    ->where(function($q) use ($names) {
        foreach ($names as $name) {
            $q->orWhere('course_name', 'like', "%$name%");
        }
    })
    ->get();

echo json_encode($exams, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
