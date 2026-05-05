<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exam_requests', function (Blueprint $table) {
            $table->integer('total_students')->default(0)->after('student_count');
            $table->integer('selected_sections_count')->default(0)->after('total_students');
            $table->string('selection_mode')->default('all_sections')->after('selected_sections_count');
        });
    }

    public function down(): void
    {
        Schema::table('exam_requests', function (Blueprint $table) {
            $table->dropColumn(['total_students', 'selected_sections_count', 'selection_mode']);
        });
    }
};
