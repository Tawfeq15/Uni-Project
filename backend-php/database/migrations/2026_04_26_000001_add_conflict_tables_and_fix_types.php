<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

/**
 * Migration: Add blackout_dates, audit_logs, and scheduled_exam_rooms tables.
 * Also safely converts exam_date/start_time/end_time to proper types.
 */
return new class extends Migration
{
    public function up(): void
    {
        // 1. ── Blackout Dates ──────────────────────────────────────────────
        Schema::create('blackout_dates', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->date('start_date');
            $table->date('end_date');
            $table->text('reason')->nullable();
            $table->timestamps();

            $table->index(['start_date', 'end_date']);
        });

        // 2. ── Audit Logs ──────────────────────────────────────────────────
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('action');          // e.g. exam_scheduled, exam_cancelled
            $table->string('entity_type')->nullable(); // e.g. scheduled_exam
            $table->unsignedBigInteger('entity_id')->nullable();
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();

            $table->index(['entity_type', 'entity_id']);
            $table->index('action');
        });

        // 3. ── Multi-Room Pivot Table ──────────────────────────────────────
        // Keeps rooms_json for backward compat, but also stores pivot rows.
        Schema::create('scheduled_exam_rooms', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('scheduled_exam_id');
            $table->string('room_name');
            $table->integer('assigned_students_count')->default(0);
            $table->timestamps();

            $table->foreign('scheduled_exam_id')
                  ->references('id')
                  ->on('scheduled_exams')
                  ->onDelete('cascade');

            $table->index('room_name');
            $table->index('scheduled_exam_id');
        });

        // 4. ── Safe column type changes on scheduled_exams ────────────────
        //    We add new typed columns, copy data, then swap.
        //    This is safe even if data already exists.

        // Add typed shadow columns
        Schema::table('scheduled_exams', function (Blueprint $table) {
            $table->date('exam_date_typed')->nullable()->after('exam_date');
            $table->time('start_time_typed')->nullable()->after('start_time');
            $table->time('end_time_typed')->nullable()->after('end_time');
        });

        // Copy existing data (safe cast — MySQL will ignore invalid format rows)
        DB::statement("
            UPDATE scheduled_exams
            SET exam_date_typed  = CASE WHEN exam_date  REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(exam_date, '%Y-%m-%d')  ELSE NULL END,
                start_time_typed = CASE WHEN start_time REGEXP '^[0-9]{2}:[0-9]{2}$'          THEN STR_TO_DATE(start_time, '%H:%i')     ELSE NULL END,
                end_time_typed   = CASE WHEN end_time   REGEXP '^[0-9]{2}:[0-9]{2}$'          THEN STR_TO_DATE(end_time, '%H:%i')       ELSE NULL END
        ");

        // Drop old varchar columns and rename typed ones
        Schema::table('scheduled_exams', function (Blueprint $table) {
            $table->dropColumn(['exam_date', 'start_time', 'end_time']);
        });

        Schema::table('scheduled_exams', function (Blueprint $table) {
            $table->renameColumn('exam_date_typed', 'exam_date');
            $table->renameColumn('start_time_typed', 'start_time');
            $table->renameColumn('end_time_typed', 'end_time');
        });

        // Add index for fast conflict queries
        Schema::table('scheduled_exams', function (Blueprint $table) {
            $table->index(['exam_date', 'start_time', 'end_time'], 'idx_exam_time_window');
            $table->index(['day', 'start_time', 'end_time'], 'idx_exam_day_window');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scheduled_exam_rooms');
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('blackout_dates');

        // Revert typed columns on scheduled_exams
        Schema::table('scheduled_exams', function (Blueprint $table) {
            $table->string('exam_date_old')->nullable()->after('exam_date');
            $table->string('start_time_old')->nullable()->after('start_time');
            $table->string('end_time_old')->nullable()->after('end_time');
        });

        DB::statement("
            UPDATE scheduled_exams
            SET exam_date_old  = DATE_FORMAT(exam_date, '%Y-%m-%d'),
                start_time_old = TIME_FORMAT(start_time, '%H:%i'),
                end_time_old   = TIME_FORMAT(end_time, '%H:%i')
        ");

        Schema::table('scheduled_exams', function (Blueprint $table) {
            $table->dropColumn(['exam_date', 'start_time', 'end_time']);
        });

        Schema::table('scheduled_exams', function (Blueprint $table) {
            $table->renameColumn('exam_date_old', 'exam_date');
            $table->renameColumn('start_time_old', 'start_time');
            $table->renameColumn('end_time_old', 'end_time');
        });
    }
};
