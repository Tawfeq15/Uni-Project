<?php
// check_media.php - temporary diagnostic script

// Laravel bootstrap
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

// 1. Find media upload record
$file = DB::table('uploaded_files')->where('original_name', 'like', '%media%')->first();
echo "=== MEDIA UPLOAD FILE ===\n";
echo json_encode($file, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n\n";

if ($file) {
    // 2. Distinct rooms in media sessions
    $rooms = DB::table('parsed_sessions')
        ->where('uploaded_file_id', $file->id)
        ->distinct()->pluck('room')->sort()->values()->toArray();
    echo "=== ROOMS IN MEDIA SESSIONS ===\n";
    print_r($rooms);

    // 3. Session count
    $count = DB::table('parsed_sessions')->where('uploaded_file_id', $file->id)->count();
    echo "\nSESSIONS COUNT: $count\n\n";
}

// 4. Rooms table - look for 3xxx rooms
$rooms3x = DB::table('rooms')->where('room_name', 'like', '3%')->get(['room_name','faculty','room_type'])->toArray();
echo "=== ROOMS TABLE (3xxx) ===\n";
print_r($rooms3x);

// 5. All distinct faculties in rooms table
$faculties = DB::table('rooms')->distinct()->pluck('faculty')->toArray();
echo "\n=== ALL FACULTIES IN ROOMS TABLE ===\n";
print_r($faculties);

// 6. Check if any 3xxx rooms are mapped to IT/Library
$wrongMapping = DB::table('rooms')
    ->where('room_name', 'like', '3%')
    ->whereIn('faculty', ['it', 'library'])
    ->get(['room_name', 'faculty'])->toArray();
echo "\n=== 3xxx ROOMS WRONGLY MAPPED TO IT/LIBRARY ===\n";
print_r($wrongMapping);
