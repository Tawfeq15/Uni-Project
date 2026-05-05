<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exam_request_sections', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('exam_request_id');
            $table->string('course_code', 50);
            $table->string('course_name');
            $table->string('section_key');
            $table->string('section_number', 50)->nullable();
            $table->string('instructor_name')->nullable();
            $table->integer('student_count')->default(0);
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->foreign('exam_request_id')->references('id')->on('exam_requests')->onDelete('cascade');
        });

        Schema::create('scheduled_exam_sections', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('scheduled_exam_id');
            $table->string('course_code', 50);
            $table->string('course_name');
            $table->string('section_key');
            $table->string('section_number', 50)->nullable();
            $table->string('instructor_name')->nullable();
            $table->integer('student_count')->default(0);
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->foreign('scheduled_exam_id')->references('id')->on('scheduled_exams')->onDelete('cascade');
        });

        Schema::create('request_approvals', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('request_id');
            $table->string('request_type', 100)->default('exam_request');
            $table->unsignedBigInteger('reviewer_id')->nullable();
            $table->string('reviewer_role', 100)->nullable();
            $table->string('action', 100);
            $table->text('comment')->nullable();
            $table->string('previous_status', 100)->nullable();
            $table->string('new_status', 100)->nullable();
            $table->timestamps();
        });

        Schema::create('invigilators', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->unsignedBigInteger('department_id')->nullable();
            $table->integer('max_exams_per_day')->default(2);
            $table->string('status')->default('active');
            $table->timestamps();
        });

        Schema::create('invigilator_availability', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('invigilator_id');
            $table->string('day');
            $table->time('start_time');
            $table->time('end_time');
            $table->text('unavailable_reason')->nullable();
            $table->timestamps();

            $table->foreign('invigilator_id')->references('id')->on('invigilators')->onDelete('cascade');
        });

        Schema::create('exam_invigilators', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('scheduled_exam_id');
            $table->unsignedBigInteger('invigilator_id');
            $table->unsignedBigInteger('room_id')->nullable();
            $table->string('role')->default('invigilator');
            $table->timestamps();

            $table->foreign('scheduled_exam_id')->references('id')->on('scheduled_exams')->onDelete('cascade');
            $table->foreign('invigilator_id')->references('id')->on('invigilators')->onDelete('cascade');
        });
        
        // Add room_id to scheduled_exam_rooms if it doesn't exist
        if (Schema::hasTable('scheduled_exam_rooms')) {
            Schema::table('scheduled_exam_rooms', function (Blueprint $table) {
                if (!Schema::hasColumn('scheduled_exam_rooms', 'room_id')) {
                    $table->unsignedBigInteger('room_id')->nullable()->after('scheduled_exam_id');
                }
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('exam_invigilators');
        Schema::dropIfExists('invigilator_availability');
        Schema::dropIfExists('invigilators');
        Schema::dropIfExists('request_approvals');
        Schema::dropIfExists('scheduled_exam_sections');
        Schema::dropIfExists('exam_request_sections');
        
        if (Schema::hasTable('scheduled_exam_rooms') && Schema::hasColumn('scheduled_exam_rooms', 'room_id')) {
            Schema::table('scheduled_exam_rooms', function (Blueprint $table) {
                $table->dropColumn('room_id');
            });
        }
    }
};
