<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Migration: Set priority_group for library lab rooms (2101–2107).
 *
 * All these rooms have faculty=library → priority_group = 'library'
 * Order within library group:
 *   2101–2106  → priority_order = 10  (fill first)
 *   2107       → priority_order = 20  (fill after 2101–2106)
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('rooms', 'priority_group')) {
            return;
        }

        // Set library group for 2101–2106 (order=10)
        DB::table('rooms')
            ->whereIn('room_name', ['2101', '2102', '2103', '2104', '2105', '2106'])
            ->update([
                'priority_group' => 'library',
                'priority_order' => 10,
            ]);

        // Set library group for 2107 (order=20 — lower priority within library)
        DB::table('rooms')
            ->where('room_name', '2107')
            ->update([
                'priority_group' => 'library',
                'priority_order' => 20,
            ]);

        // Also infer priority_group for ALL rooms that still have it NULL
        // using the same logic as FinalExamLabAssignmentService::inferPriorityGroup
        DB::statement("
            UPDATE rooms
            SET priority_group = CASE
                WHEN LOWER(faculty)   LIKE '%مكتبة%'  THEN 'library'
                WHEN LOWER(faculty)   LIKE '%library%' THEN 'library'
                WHEN LOWER(faculty)   LIKE '%تكنولوجيا%' THEN 'it'
                WHEN LOWER(faculty)   LIKE '%it%'     THEN 'it'
                WHEN LOWER(room_type) LIKE '%library%' THEN 'library'
                ELSE 'other'
            END
            WHERE priority_group IS NULL OR priority_group = ''
        ");
    }

    public function down(): void
    {
        DB::table('rooms')
            ->whereIn('room_name', ['2101', '2102', '2103', '2104', '2105', '2106', '2107'])
            ->update(['priority_group' => null]);
    }
};
