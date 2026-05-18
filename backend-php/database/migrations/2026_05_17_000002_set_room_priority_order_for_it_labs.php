<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Migration: Set specific priority_order for IT lab rooms.
 *
 * Rule requested:
 *   Rooms 2101-2106 → priority_order = 10   (fill first)
 *   Room  2107      → priority_order = 20   (fill after 2101-2106)
 *
 * Rooms not listed keep their existing value (default 999).
 * This is scoped to the Final Computerized Import feature only.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('rooms', 'priority_order')) {
            return; // Guard: column must exist first (created in previous migration)
        }

        // Rooms 2101–2106 get priority_order = 10 (higher priority)
        DB::table('rooms')
            ->whereIn('room_name', ['2101', '2102', '2103', '2104', '2105', '2106'])
            ->update(['priority_order' => 10]);

        // Room 2107 gets priority_order = 20 (lower priority than 2101-2106)
        DB::table('rooms')
            ->where('room_name', '2107')
            ->update(['priority_order' => 20]);
    }

    public function down(): void
    {
        // Reset to default
        DB::table('rooms')
            ->whereIn('room_name', ['2101', '2102', '2103', '2104', '2105', '2106', '2107'])
            ->update(['priority_order' => 999]);
    }
};
