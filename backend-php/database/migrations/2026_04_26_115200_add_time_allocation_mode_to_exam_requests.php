<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exam_requests', function (Blueprint $table) {
            $table->string('preferred_time_from')->nullable()->after('preferred_date');
            $table->string('preferred_time_to')->nullable()->after('preferred_time_from');
            $table->string('time_allocation_mode')->default('auto')->after('selection_mode');
        });
    }

    public function down(): void
    {
        Schema::table('exam_requests', function (Blueprint $table) {
            $table->dropColumn('time_allocation_mode');
        });
    }
};
