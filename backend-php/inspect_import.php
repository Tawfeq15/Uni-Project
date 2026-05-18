<?php
require 'vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$import = DB::table('exam_schedule_imports')->orderBy('id', 'desc')->first();

$rows = DB::table('exam_schedule_import_rows')
    ->select('row_number', 'course_code', 'exam_date', 'start_time', 'end_time', 'rooms', 'errors')
    ->where('import_id', $import->id)
    ->where('status', 'conflict')
    ->limit(10)
    ->get();

foreach($rows as $r) {
    echo "Row $r->row_number: $r->course_code | Date: $r->exam_date | $r->start_time - $r->end_time | Rooms: $r->rooms\n";
    echo "Errors: $r->errors\n\n";
}
