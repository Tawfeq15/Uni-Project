<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

$rows = Illuminate\Support\Facades\DB::table('exam_schedule_import_rows')
    ->orderBy('id', 'desc')
    ->limit(20)
    ->get();

echo json_encode($rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
