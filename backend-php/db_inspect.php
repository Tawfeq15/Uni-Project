<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

echo "=== CONNECTION ===\n";
echo "Driver: " . config('database.default') . "\n";
$conn = config('database.connections.' . config('database.default'));
echo "Host: " . ($conn['host'] ?? 'N/A') . " | DB: " . ($conn['database'] ?? 'N/A') . "\n";

echo "\n=== TABLES ===\n";
$tables = DB::select("SHOW TABLES");
$tableList = array_map(fn($t) => array_values((array) $t)[0], $tables);
foreach ($tableList as $n)
    echo "  $n\n";

$skipTables = ['migrations', 'cache', 'cache_locks', 'jobs', 'job_batches', 'failed_jobs', 'sessions', 'password_reset_tokens', 'users'];

echo "\n=== SCHEMA ===\n";
foreach ($tableList as $name) {
    if (in_array($name, $skipTables))
        continue;
    $cols = DB::select("SHOW COLUMNS FROM `$name`");
    $count = DB::table($name)->count();
    echo "\n[$name] ($count rows)\n";
    foreach ($cols as $col) {
        echo "  {$col->Field} | {$col->Type} | null:{$col->Null} | default:" . ($col->Default ?? 'NULL') . "\n";
    }
}

echo "\n=== exam_requests STATUS BREAKDOWN ===\n";
$statuses = DB::table('exam_requests')->select('status', DB::raw('count(*) as cnt'))->groupBy('status')->get();
foreach ($statuses as $s)
    echo "  {$s->status}: {$s->cnt}\n";

echo "\n=== scheduled_exams STATUS BREAKDOWN ===\n";
$statuses = DB::table('scheduled_exams')->select('status', DB::raw('count(*) as cnt'))->groupBy('status')->get();
foreach ($statuses as $s)
    echo "  {$s->status}: {$s->cnt}\n";

echo "\n=== uploaded_files ===\n";
$files = DB::table('uploaded_files')->orderBy('id', 'desc')->get();
foreach ($files as $f)
    echo "  id:{$f->id} faculty:{$f->faculty} file:{$f->original_filename} parsed:{$f->is_parsed} sessions:" . DB::table('parsed_sessions')->where('uploaded_file_id', $f->id)->count() . "\n";

echo "\n=== LAST 3 exam_requests ===\n";
$rows = DB::table('exam_requests')->orderBy('id', 'desc')->limit(3)->get();
foreach ($rows as $r)
    echo json_encode($r, JSON_UNESCAPED_UNICODE) . "\n";

echo "\n=== LAST 3 scheduled_exams ===\n";
$rows = DB::table('scheduled_exams')->orderBy('id', 'desc')->limit(3)->get();
foreach ($rows as $r)
    echo json_encode($r, JSON_UNESCAPED_UNICODE) . "\n";

echo "\nDone.\n";
