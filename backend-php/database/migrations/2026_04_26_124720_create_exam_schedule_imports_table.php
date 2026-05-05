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
        Schema::create('exam_schedule_imports', function (Blueprint $table) {
            $table->id();
            $table->string('faculty');
            $table->string('academic_year')->nullable();
            $table->string('semester')->nullable();
            $table->string('exam_period')->nullable();
            $table->string('original_filename');
            $table->string('stored_path');
            $table->string('status')->default('preview'); // preview, imported, failed
            $table->integer('total_rows')->default(0);
            $table->integer('valid_rows')->default(0);
            $table->integer('invalid_rows')->default(0);
            $table->integer('imported_rows')->default(0);
            $table->string('operator_name')->nullable();
            $table->string('operator_role')->nullable();
            $table->timestamps();
        });

        Schema::create('exam_schedule_import_rows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('import_id')->constrained('exam_schedule_imports')->onDelete('cascade');
            $table->integer('row_number');
            $table->string('course_code')->nullable();
            $table->string('course_name')->nullable();
            $table->json('section_numbers')->nullable();
            $table->json('instructors')->nullable();
            $table->integer('student_count')->nullable();
            $table->integer('capacity')->nullable();
            $table->json('rooms')->nullable();
            $table->date('exam_date')->nullable();
            $table->string('day', 50)->nullable();
            $table->time('start_time')->nullable();
            $table->time('end_time')->nullable();
            $table->integer('duration_minutes')->nullable();
            $table->string('status')->default('pending'); // valid, invalid, imported
            $table->json('errors')->nullable();
            $table->json('raw_data')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('exam_schedule_import_rows');
        Schema::dropIfExists('exam_schedule_imports');
    }
};
