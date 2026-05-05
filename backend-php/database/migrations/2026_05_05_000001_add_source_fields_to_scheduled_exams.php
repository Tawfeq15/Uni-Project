<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migration: Add source tracking + missing indexes for exam management.
 * All additions are safe (nullable / IF NOT EXISTS guarded).
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── 1. Source tracking columns on scheduled_exams ─────────────────
        Schema::table('scheduled_exams', function (Blueprint $table) {
            if (!Schema::hasColumn('scheduled_exams', 'source_type')) {
                $table->string('source_type', 50)->nullable()->after('exam_period')
                      ->comment('manual | import | conflict_approval | rescheduled');
            }
            if (!Schema::hasColumn('scheduled_exams', 'import_id')) {
                $table->unsignedBigInteger('import_id')->nullable()->after('source_type')
                      ->comment('FK to exam_schedule_imports (no cascade to avoid accidental deletes)');
            }
            if (!Schema::hasColumn('scheduled_exams', 'import_row_id')) {
                $table->unsignedBigInteger('import_row_id')->nullable()->after('import_id')
                      ->comment('FK to exam_schedule_import_rows');
            }
        });

        // ── 2. Missing indexes on scheduled_exams ─────────────────────────
        Schema::table('scheduled_exams', function (Blueprint $table) {
            // Guard: Laravel will throw if index already exists, so we wrap in try/catch at DB level.
            // Using raw index names avoids duplicate detection issues.
            try { $table->index('faculty',     'idx_se_faculty'); }    catch (\Exception $e) {}
            try { $table->index('status',      'idx_se_status'); }     catch (\Exception $e) {}
            try { $table->index('exam_period', 'idx_se_exam_period'); } catch (\Exception $e) {}
            try { $table->index('source_type', 'idx_se_source_type'); } catch (\Exception $e) {}
            try { $table->index('import_id',   'idx_se_import_id'); }  catch (\Exception $e) {}
        });

        // ── 3. Missing indexes on exam_conflict_groups ────────────────────
        if (Schema::hasTable('exam_conflict_groups')) {
            Schema::table('exam_conflict_groups', function (Blueprint $table) {
                try { $table->index('status',        'idx_ecg_status'); }     catch (\Exception $e) {}
                try { $table->index('conflict_type', 'idx_ecg_type'); }       catch (\Exception $e) {}
                try { $table->index('severity',      'idx_ecg_severity'); }   catch (\Exception $e) {}
            });
        }

        // ── 4. Missing indexes on exam_conflict_items ─────────────────────
        if (Schema::hasTable('exam_conflict_items')) {
            Schema::table('exam_conflict_items', function (Blueprint $table) {
                try { $table->index('action_status', 'idx_eci_action_status'); } catch (\Exception $e) {}
                try { $table->index('exam_date',     'idx_eci_exam_date'); }     catch (\Exception $e) {}
                try { $table->index('import_row_id', 'idx_eci_import_row_id'); } catch (\Exception $e) {}
            });
        }

        // ── 5. severity column on exam_conflict_groups (if missing) ───────
        if (Schema::hasTable('exam_conflict_groups') &&
            !Schema::hasColumn('exam_conflict_groups', 'severity')) {
            Schema::table('exam_conflict_groups', function (Blueprint $table) {
                $table->string('severity', 20)->default('error')->after('conflict_type')
                      ->comment('error | warning');
            });
        }
    }

    public function down(): void
    {
        Schema::table('scheduled_exams', function (Blueprint $table) {
            try { $table->dropIndex('idx_se_faculty'); }     catch (\Exception $e) {}
            try { $table->dropIndex('idx_se_status'); }      catch (\Exception $e) {}
            try { $table->dropIndex('idx_se_exam_period'); } catch (\Exception $e) {}
            try { $table->dropIndex('idx_se_source_type'); } catch (\Exception $e) {}
            try { $table->dropIndex('idx_se_import_id'); }   catch (\Exception $e) {}

            $cols = ['source_type', 'import_id', 'import_row_id'];
            foreach ($cols as $col) {
                if (Schema::hasColumn('scheduled_exams', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
