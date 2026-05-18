<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Migration: Fix priority_group for architecture and literature rooms.
 *
 * The previous migration incorrectly assigned 'it' to architecture and
 * literature faculties because their room names/types matched partial keywords.
 *
 * Correct assignments:
 *   faculty = 'library'       → priority_group = 'library'
 *   faculty = 'it'            → priority_group = 'it'
 *   faculty = 'architecture'  → priority_group = 'other'
 *   faculty = 'literature'    → priority_group = 'other'
 *   faculty = 'media'         → priority_group = 'other'
 *   faculty = 'law'           → priority_group = 'other'
 */
return new class extends Migration
{
    public function up(): void
    {
        // Explicitly correct: only 'it' faculty rooms go to 'it' group
        DB::table('rooms')
            ->where('faculty', 'it')
            ->update(['priority_group' => 'it', 'priority_order' => 999]);

        // Correct: architecture, literature, media, law → other
        DB::table('rooms')
            ->whereIn('faculty', ['architecture', 'literature', 'media', 'law'])
            ->update(['priority_group' => 'other', 'priority_order' => 999]);

        // Correct: library stays library (already set but ensure order=10 for 2101-2106, 20 for 2107)
        DB::table('rooms')
            ->where('faculty', 'library')
            ->whereNotIn('room_name', ['2101', '2102', '2103', '2104', '2105', '2106', '2107'])
            ->update(['priority_group' => 'library', 'priority_order' => 15]);
    }

    public function down(): void
    {
        // No safe rollback for data corrections
    }
};
