<?php
require 'vendor/autoload.php';
require 'bootstrap/app.php';
$app = app();
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$importService = app(\App\Services\ExamScheduleImportService::class);
$import = DB::table('exam_schedule_imports')->orderBy('id', 'desc')->first();
$filePath = storage_path('app/' . $import->stored_path);

$rows = \Maatwebsite\Excel\Facades\Excel::toArray(new \App\Imports\ScheduleImport(), $filePath)[0];
$headers = array_shift($rows);

// Hardcode map for testing
$headerMap = [
    'course_code' => 5,
    'course_name' => 3,
    'sections' => 4,
    'instructors' => 2,
    'date' => 7,
    'day' => 8,
    'time' => 6,
    'rooms' => 1,
    'student_count' => 0,
];

$lastDate = null;
foreach ($rows as $index => $row) {
    if (empty(array_filter($row))) continue;
    $dateVal = isset($row[$headerMap['date']]) ? trim($row[$headerMap['date']]) : null;
    $courseCode = isset($row[$headerMap['course_code']]) ? trim($row[$headerMap['course_code']]) : null;
    
    echo "Row $index | Course: $courseCode | CellDate: '$dateVal' | LastDate: '$lastDate'\n";
    
    if (!empty($dateVal)) {
        $lastDate = $dateVal;
    }
}
