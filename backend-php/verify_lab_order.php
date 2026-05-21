<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

echo "IT Labs (in assignment order):\n";
$labs = DB::table('rooms')
    ->where('priority_group', 'it')
    ->where('is_active', 1)
    ->orderBy('priority_order')
    ->orderByRaw('CAST(room_name AS UNSIGNED)')
    ->get(['room_name', 'priority_order', 'capacity']);

foreach ($labs as $l) {
    $flag = '';
    if (in_array($l->room_name, ['7418','7419'])) $flag = '  ← third-to-last';
    if ($l->room_name === '7325') $flag = '  ← second-to-last';
    if ($l->room_name === '7417') $flag = '  ← LAST';
    printf("  %-10s | order=%-5s | cap=%d%s\n", $l->room_name, $l->priority_order, $l->capacity, $flag);
}

echo "\nLibrary Labs (in assignment order):\n";
$libs = DB::table('rooms')
    ->where('priority_group', 'library')
    ->where('is_active', 1)
    ->orderBy('priority_order')
    ->orderByRaw('CAST(room_name AS UNSIGNED)')
    ->get(['room_name', 'priority_order', 'capacity']);

foreach ($libs as $l) {
    printf("  %-10s | order=%-5s | cap=%d\n", $l->room_name, $l->priority_order, $l->capacity);
}
