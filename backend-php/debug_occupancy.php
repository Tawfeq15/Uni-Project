<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

echo "DEBUGGING OCCUPANCY DATA...\n";

// 1. Check total rows in parsed_sessions
$total = DB::table('parsed_sessions')->count();
$valid = DB::table('parsed_sessions')->where('is_valid', 1)->count();
echo "Total parsed_sessions: $total ($valid valid)\n";

// 2. Check faculties in parsed_sessions
$faculties = DB::table('parsed_sessions')->select('faculty', DB::raw('count(*) as count'))->groupBy('faculty')->get();
echo "\nFaculties in parsed_sessions:\n";
foreach ($faculties as $f) {
    echo "- {$f->faculty}: {$f->count}\n";
}

// 3. Check some sample sessions and their room match
echo "\nSample Sessions (first 5):\n";
$samples = DB::table('parsed_sessions')
    ->select('id', 'room', 'faculty', 'day', 'start_time', 'end_time', 'is_valid')
    ->limit(5)
    ->get();

foreach ($samples as $s) {
    $match = DB::table('rooms')->where('room_name', $s->room)->exists();
    echo "- ID: {$s->id} | Room: {$s->room} | Faculty: {$s->faculty} | Match in rooms table? " . ($match ? "YES" : "NO") . " | Valid: {$s->is_valid}\n";
}

// 4. Check OccupancyService logic - toMinutes
$svc = app(\App\Services\OccupancyService::class);
echo "\nTesting toMinutes('08:00'): " . $svc->toMinutes('08:00') . "\n";

// 5. Check if any sessions overlap with the 8:00-16:00 window
$windowStart = 8 * 60;
$windowEnd = 16 * 60;
echo "Window: $windowStart to $windowEnd\n";

// 6. Check rooms table faculties
echo "\nRooms in DB:\n";
$rooms = DB::table('rooms')->select('room_name', 'faculty')->get();
// 9. Check for hidden characters in room names
echo "\nRoom name hex check:\n";
$rooms = DB::table('parsed_sessions')->select('room')->distinct()->limit(5)->get();
foreach ($rooms as $r) {
    echo "- Room: '{$r->room}' | Hex: " . bin2hex($r->room) . "\n";
}
