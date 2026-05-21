<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

echo "Fixing IT lab priorities...\n\n";

// Main IT labs → picked FIRST (priority_order = 100)
$mainIT = ['7416', '7420', '7422', '7424', '7426', '7428'];
$n = DB::table('rooms')->whereIn('room_name', $mainIT)->update(['priority_order' => 100]);
echo "Main IT labs (" . implode(', ', $mainIT) . ") → order=100 ($n rows updated)\n";

// 7418 and 7419 → third-to-last (order 990) — already set, confirm
$n = DB::table('rooms')->whereIn('room_name', ['7418', '7419'])->update(['priority_order' => 990]);
echo "7418, 7419 → order=990 ($n rows updated)\n";

// 7325 → second-to-last (order 995) — already set, confirm
$n = DB::table('rooms')->where('room_name', '7325')->update(['priority_order' => 995]);
echo "7325 → order=995 ($n rows updated)\n";

// 7417 → last (order 999) — already set, confirm
$n = DB::table('rooms')->where('room_name', '7417')->update(['priority_order' => 999]);
echo "7417 → order=999 ($n rows updated)\n";

echo "\n=== Final IT Lab Assignment Order ===\n";
$labs = DB::table('rooms')
    ->where('priority_group', 'it')
    ->where('is_active', 1)
    ->orderBy('priority_order')
    ->orderByRaw('CAST(room_name AS UNSIGNED)')
    ->get(['room_name', 'priority_order', 'capacity']);

foreach ($labs as $i => $l) {
    $rank = $i + 1;
    $flag = match($l->room_name) {
        '7418', '7419' => '⚠️ third-to-last group',
        '7325'         => '⚠️ second-to-last',
        '7417'         => '🔴 LAST choice',
        default        => '✅ preferred'
    };
    printf("  #%-2d %-10s | order=%-5s | cap=%-3d | %s\n",
        $rank, $l->room_name, $l->priority_order, $l->capacity, $flag);
}
