<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('uploaded_files', function (Blueprint $table) {
            $table->id();
            $table->string('original_name');
            $table->string('stored_path');
            $table->string('faculty');
            $table->string('file_type')->default('schedule');
            $table->tinyInteger('is_active')->default(1);
            $table->string('upload_status')->default('uploaded');
            $table->string('parse_status')->default('pending');
            $table->timestamp('uploaded_at')->nullable()->useCurrent();
            $table->timestamp('parsed_at')->nullable();
            $table->integer('sessions_count')->default(0);
            $table->text('error_message')->nullable();
        });

        Schema::create('parsed_sessions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('uploaded_file_id');
            $table->string('faculty')->nullable();
            $table->string('course_code')->nullable();
            $table->string('course_name')->nullable();
            $table->string('section')->nullable();
            $table->string('activity_type')->nullable();
            $table->string('lecturer')->nullable();
            $table->string('room')->nullable();
            $table->string('room_type')->default('room');
            $table->string('day')->nullable();
            $table->string('start_time')->nullable();
            $table->string('end_time')->nullable();
            $table->integer('duration_minutes')->nullable();
            $table->integer('capacity')->default(0);
            $table->integer('enrolled_count')->default(0);
            $table->tinyInteger('is_valid')->default(1);
            $table->text('validation_note')->nullable();
            $table->text('raw_data_json')->nullable();
            $table->foreign('uploaded_file_id')->references('id')->on('uploaded_files')->onDelete('cascade');
        });

        Schema::create('rooms', function (Blueprint $table) {
            $table->id();
            $table->string('faculty')->nullable();
            $table->string('room_name');
            $table->string('room_type')->default('room');
            $table->integer('capacity')->default(0);
            $table->tinyInteger('is_active')->default(1);
            $table->unique(['room_name', 'faculty']);
        });

        Schema::create('exam_requests', function (Blueprint $table) {
            $table->id();
            $table->string('course_code')->nullable();
            $table->string('course_name')->nullable();
            $table->string('section')->nullable();
            $table->string('lecturer')->nullable();
            $table->integer('student_count')->default(0);
            $table->string('faculty')->nullable();
            $table->string('preferred_day')->nullable();
            $table->string('preferred_date')->nullable();
            $table->integer('duration_minutes')->default(60);
            $table->string('room_type_preference')->default('room');
            $table->text('notes')->nullable();
            $table->string('status')->default('pending');
            $table->timestamp('created_at')->nullable()->useCurrent();
        });

        Schema::create('scheduled_exams', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('exam_request_id')->nullable();
            $table->string('faculty')->nullable();
            $table->string('day')->nullable();
            $table->string('exam_date')->nullable();
            $table->string('start_time')->nullable();
            $table->string('end_time')->nullable();
            $table->integer('duration_minutes')->nullable();
            $table->string('lecturer')->nullable();
            $table->text('rooms_json')->nullable();
            $table->integer('total_capacity')->default(0);
            $table->integer('student_count')->default(0);
            $table->string('course_code')->nullable();
            $table->string('course_name')->nullable();
            $table->string('section')->nullable();
            $table->string('status')->default('scheduled');
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->foreign('exam_request_id')->references('id')->on('exam_requests')->onDelete('set null');
        });

        Schema::create('conflicts', function (Blueprint $table) {
            $table->id();
            $table->string('conflict_type');
            $table->string('reference_type')->nullable();
            $table->unsignedBigInteger('reference_id')->nullable();
            $table->string('faculty')->nullable();
            $table->string('room')->nullable();
            $table->string('lecturer')->nullable();
            $table->string('day')->nullable();
            $table->string('start_time')->nullable();
            $table->string('end_time')->nullable();
            $table->text('message')->nullable();
            $table->string('severity')->default('error');
            $table->timestamp('created_at')->nullable()->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('conflicts');
        Schema::dropIfExists('scheduled_exams');
        Schema::dropIfExists('exam_requests');
        Schema::dropIfExists('rooms');
        Schema::dropIfExists('parsed_sessions');
        Schema::dropIfExists('uploaded_files');
    }
};
