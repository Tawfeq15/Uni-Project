<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migration: Final Computerized Import Tables
 *
 * Creates isolated tables for the استيراد النهائي المحوسب feature.
 * Also safely adds priority_group + priority_order to existing rooms table.
 *
 * This migration is COMPLETELY INDEPENDENT from the existing exam import flow.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── 1. Add priority columns to rooms table (safe, nullable) ──────────
        Schema::table('rooms', function (Blueprint $table) {
            if (!Schema::hasColumn('rooms', 'priority_group')) {
                // library | it | other
                $table->string('priority_group', 20)->nullable()->after('is_active')
                      ->comment('library | it | other — for final computerized exam lab assignment');
            }
            if (!Schema::hasColumn('rooms', 'priority_order')) {
                $table->unsignedSmallInteger('priority_order')->default(999)->after('priority_group')
                      ->comment('Lower = higher priority. library=1, it=2, other=3');
            }
            if (!Schema::hasColumn('rooms', 'building')) {
                $table->string('building')->nullable()->after('faculty')
                      ->comment('Building identifier');
            }
        });

        // ── 2. final_computerized_imports — import session table ─────────────
        Schema::create('final_computerized_imports', function (Blueprint $table) {
            $table->id();
            $table->string('original_filename');
            $table->string('stored_path');
            $table->string('academic_year', 20)->nullable();
            $table->string('semester', 20)->nullable();
            $table->string('exam_period', 20)->default('final');
            $table->string('faculty', 100)->nullable();
            $table->string('status', 30)->default('preview')
                  ->comment('preview | assigned | confirmed | failed');
            $table->integer('total_rows')->default(0);
            $table->integer('valid_rows')->default(0);
            $table->integer('assigned_rows')->default(0);
            $table->integer('needs_review_rows')->default(0);
            $table->integer('conflict_rows')->default(0);
            $table->integer('invalid_rows')->default(0);
            $table->integer('total_students')->default(0);
            $table->string('operator_name', 100)->nullable()->default('Exam Coordinator');
            $table->string('operator_role', 50)->nullable()->default('admin');
            $table->timestamps();

            $table->index('status');
            $table->index('created_at');
        });

        // ── 3. final_computerized_import_rows — per-row data ─────────────────
        Schema::create('final_computerized_import_rows', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('import_id');
            $table->integer('row_number');

            // Parsed from Excel
            $table->string('course_code', 50)->nullable();
            $table->string('section_number', 20)->nullable();
            $table->string('course_name')->nullable();
            $table->string('instructor_name')->nullable();
            $table->integer('student_count')->default(0);
            $table->string('exam_type', 50)->nullable();
            $table->string('platform', 50)->nullable();
            $table->string('day', 30)->nullable();
            $table->date('exam_date')->nullable();
            $table->time('start_time')->nullable();
            $table->time('end_time')->nullable();

            // Assignment result
            $table->json('assigned_labs')->nullable()
                  ->comment('Array of {lab_name, capacity, priority_group}');
            $table->integer('assigned_capacity')->nullable();

            // Grouping
            $table->string('group_key', 64)->nullable()
                  ->comment('md5 hash for grouping same-course same-time sections');
            $table->boolean('is_group_representative')->default(false)
                  ->comment('true = this row is the primary row for the group');

            // Status & messages
            $table->string('status', 30)->default('pending')
                  ->comment('pending | valid | assigned | needs_review | conflict | invalid | imported');
            $table->json('errors')->nullable();
            $table->json('warnings')->nullable();
            $table->json('raw_data')->nullable();

            $table->timestamps();

            $table->foreign('import_id')
                  ->references('id')
                  ->on('final_computerized_imports')
                  ->onDelete('cascade');

            $table->index('import_id');
            $table->index('group_key');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('final_computerized_import_rows');
        Schema::dropIfExists('final_computerized_imports');

        // Remove added columns from rooms (guard each)
        Schema::table('rooms', function (Blueprint $table) {
            if (Schema::hasColumn('rooms', 'priority_group')) {
                $table->dropColumn('priority_group');
            }
            if (Schema::hasColumn('rooms', 'priority_order')) {
                $table->dropColumn('priority_order');
            }
            if (Schema::hasColumn('rooms', 'building')) {
                $table->dropColumn('building');
            }
        });
    }
};
