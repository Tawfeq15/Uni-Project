<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

$file = DB::table('uploaded_files')->where('original_name', 'like', '%تقنية%')->first();
if ($file) {
    echo "IT FILE: " . $file->original_name . " (faculty: " . $file->faculty . ")\n";
    $rooms = DB::table('parsed_sessions')->where('uploaded_file_id', $file->id)->distinct()->pluck('room')->sort()->values()->toArray();
    echo "ROOMS: " . implode(', ', $rooms) . "\n";
    
    $faculties = DB::table('rooms')->whereIn('room_name', $rooms)->distinct()->pluck('faculty')->toArray();
    echo "MAPPED FACULTIES: " . implode(', ', $faculties) . "\n";
} else {
    echo "IT file not found.\n";
}
