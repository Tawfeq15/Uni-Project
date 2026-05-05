<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add operator_name and operator_role to audit_logs
        Schema::table('audit_logs', function (Blueprint $table) {
            if (!Schema::hasColumn('audit_logs', 'operator_name')) {
                $table->string('operator_name', 255)->nullable()->after('user_id');
            }
            if (!Schema::hasColumn('audit_logs', 'operator_role')) {
                $table->string('operator_role', 100)->nullable()->after('operator_name');
            }
        });

        // Add reviewer_name to request_approvals
        Schema::table('request_approvals', function (Blueprint $table) {
            if (!Schema::hasColumn('request_approvals', 'reviewer_name')) {
                $table->string('reviewer_name', 255)->nullable()->after('reviewer_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropColumn(['operator_name', 'operator_role']);
        });
        Schema::table('request_approvals', function (Blueprint $table) {
            $table->dropColumn('reviewer_name');
        });
    }
};
