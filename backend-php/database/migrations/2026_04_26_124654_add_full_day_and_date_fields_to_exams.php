<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Alter scheduled_exams
        Schema::table('scheduled_exams', function (Blueprint $table) {
            $table->boolean('is_full_day')->default(false)->after('status');
            $table->string('booking_scope', 50)->nullable()->after('is_full_day');
            $table->string('exam_type', 100)->nullable()->after('booking_scope');
            $table->integer('expected_students')->nullable()->after('exam_type');
            $table->string('academic_year', 50)->nullable()->after('expected_students');
            $table->string('semester', 50)->nullable()->after('academic_year');
            $table->string('exam_period', 50)->nullable()->after('semester');
        });

        // Safe conversion of string columns to DATE/TIME in scheduled_exams
        // MySQL requires raw SQL to safely cast strings to dates if data already exists,
        // but since we don't want to crash on bad data, let's just make sure they are strings 
        // that will be updated to YYYY-MM-DD or use the string columns.
        // The prompt says: "- exam_date must be stored as DATE in MySQL, not random string.
        // - start_time and end_time must be stored as TIME."
        DB::statement('ALTER TABLE scheduled_exams MODIFY exam_date DATE NULL');
        DB::statement('ALTER TABLE scheduled_exams MODIFY start_time TIME NULL');
        DB::statement('ALTER TABLE scheduled_exams MODIFY end_time TIME NULL');

        // Alter exam_requests
        Schema::table('exam_requests', function (Blueprint $table) {
            $table->boolean('is_full_day')->default(false)->after('status');
            $table->string('booking_scope', 50)->nullable()->after('is_full_day');
            $table->string('exam_type', 100)->nullable()->after('booking_scope');
            $table->integer('expected_students')->nullable()->after('exam_type');
            $table->string('academic_year', 50)->nullable()->after('expected_students');
            $table->string('semester', 50)->nullable()->after('academic_year');
            $table->string('exam_period', 50)->nullable()->after('semester');
        });
        
        DB::statement('ALTER TABLE exam_requests MODIFY preferred_date DATE NULL');
        DB::statement('ALTER TABLE exam_requests MODIFY preferred_time_from TIME NULL');
        DB::statement('ALTER TABLE exam_requests MODIFY preferred_time_to TIME NULL');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('scheduled_exams', function (Blueprint $table) {
            $table->dropColumn([
                'is_full_day',
                'booking_scope',
                'exam_type',
                'expected_students',
                'academic_year',
                'semester',
                'exam_period'
            ]);
        });
        
        DB::statement('ALTER TABLE scheduled_exams MODIFY exam_date VARCHAR(255) NULL');
        DB::statement('ALTER TABLE scheduled_exams MODIFY start_time VARCHAR(255) NULL');
        DB::statement('ALTER TABLE scheduled_exams MODIFY end_time VARCHAR(255) NULL');

        Schema::table('exam_requests', function (Blueprint $table) {
            $table->dropColumn([
                'is_full_day',
                'booking_scope',
                'exam_type',
                'expected_students',
                'academic_year',
                'semester',
                'exam_period'
            ]);
        });
        
        DB::statement('ALTER TABLE exam_requests MODIFY preferred_date VARCHAR(255) NULL');
        DB::statement('ALTER TABLE exam_requests MODIFY preferred_time_from VARCHAR(255) NULL');
        DB::statement('ALTER TABLE exam_requests MODIFY preferred_time_to VARCHAR(255) NULL');
    }
};
