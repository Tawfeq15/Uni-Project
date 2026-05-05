<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
echo json_encode(DB::select("SELECT room, day, start_time, end_time, course_name FROM parsed_sessions WHERE room='2104' AND is_valid=1 AND uploaded_file_id IN (SELECT id FROM uploaded_files WHERE is_active = 1)"), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
