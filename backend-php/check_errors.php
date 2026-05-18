<?php
require 'vendor/autoload.php';
require 'bootstrap/app.php';
$app = app();
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$imports = DB::table('exam_schedule_import_rows')
             ->whereIn('course_code', ['603492', '605335', '605340', '101108', '101115'])
             ->orderBy('id', 'asc')->get();

foreach($imports as $i) {
    echo "ID: {$i->id} | {$i->course_code} - {$i->course_name} | status: {$i->status} | date: {$i->exam_date} | raw_date: " . json_decode($i->raw_data, true)[7] . " | err: {$i->errors} | warn: {$i->warnings}\n";
}
