<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conflicts', function (Blueprint $table) {
            // Exam date for accurate day derivation
            if (!Schema::hasColumn('conflicts', 'exam_date')) {
                $table->date('exam_date')->nullable()->after('day');
            }
            // Rich details JSON (exam day, session days, time overlap info, etc.)
            if (!Schema::hasColumn('conflicts', 'details_json')) {
                $table->longText('details_json')->nullable()->after('message');
            }
        });
    }

    public function down(): void
    {
        Schema::table('conflicts', function (Blueprint $table) {
            $table->dropColumn(['exam_date', 'details_json']);
        });
    }
};
