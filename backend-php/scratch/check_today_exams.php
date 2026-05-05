<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

$today = date('Y-m-d'); // 2026-05-04
$todayDay = strtolower(date('l')); // monday

echo "=== اليوم: $today ($todayDay) ===\n\n";

// Exams for today's exact date
$todayExams = DB::table('scheduled_exams')
    ->where('exam_date', $today)
    ->where('status', '!=', 'cancelled')
    ->get();
echo "امتحانات بتاريخ اليوم ($today): " . $todayExams->count() . "\n";

// All distinct dates for monday
$mondayDates = DB::table('scheduled_exams')
    ->where('day', 'monday')
    ->where('status', '!=', 'cancelled')
    ->distinct()
    ->pluck('exam_date');
echo "\nجميع تواريخ الاثنين في قاعدة البيانات:\n";
foreach ($mondayDates as $d) {
    $cnt = DB::table('scheduled_exams')->where('exam_date',$d)->where('status','!=','cancelled')->count();
    echo "  - $d : $cnt امتحان\n";
}

// Check if 4/5/2026 exists in any format
echo "\n\nامتحانات 4 مايو بأشكال مختلفة:\n";
$variants = ['2026-05-04','2026-5-4','04/05/2026','4/5/2026'];
foreach ($variants as $v) {
    $c = DB::table('scheduled_exams')->where('exam_date', $v)->count();
    echo "  '$v' => $c\n";
}
