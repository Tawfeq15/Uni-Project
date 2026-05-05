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
        Schema::table('parsed_sessions', function (Blueprint $table) {
            $table->unsignedBigInteger('room_id')->nullable()->after('room');
            $table->string('room_raw')->nullable()->after('room_id');
            $table->string('academic_year')->nullable()->after('room_raw');
            $table->string('semester')->nullable()->after('academic_year');
            $table->text('notes')->nullable()->after('validation_note');
            
            $table->foreign('room_id')->references('id')->on('rooms')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('parsed_sessions', function (Blueprint $table) {
            $table->dropForeign(['room_id']);
            $table->dropColumn(['room_id', 'room_raw', 'academic_year', 'semester', 'notes']);
        });
    }
};
