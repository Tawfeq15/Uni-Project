<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('scheduled_exams', function (Blueprint $table) {
            $table->index('exam_date');
            $table->index('start_time');
            $table->index('course_code');
            $table->index('faculty');
            $table->index('status');
            $table->index('exam_period');
        });

        Schema::table('exam_schedule_import_rows', function (Blueprint $table) {
            $table->index('exam_date');
            $table->index('start_time');
            $table->index('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('scheduled_exams', function (Blueprint $table) {
            $table->dropIndex(['exam_date']);
            $table->dropIndex(['start_time']);
            $table->dropIndex(['course_code']);
            $table->dropIndex(['faculty']);
            $table->dropIndex(['status']);
            $table->dropIndex(['exam_period']);
        });

        Schema::table('exam_schedule_import_rows', function (Blueprint $table) {
            $table->dropIndex(['exam_date']);
            $table->dropIndex(['start_time']);
            $table->dropIndex(['status']);
        });
    }
};
