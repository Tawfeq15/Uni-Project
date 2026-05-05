<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$sessions = \Illuminate\Support\Facades\DB::table('parsed_sessions')
    ->where('room', '2101')
    ->where('day', 'monday')
    ->get();

foreach ($sessions as $s) {
    echo "{$s->start_time} - {$s->end_time} | {$s->course_code} - {$s->course_name} | Valid: {$s->is_valid} | Note: {$s->validation_note}\n";
}
