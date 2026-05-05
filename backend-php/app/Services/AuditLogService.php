<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class AuditLogService
{
    /**
     * Log an action to the audit_logs table.
     * Works in no-login mode: user_id is nullable, operator_name/role used instead.
     */
    public function log(
        string $action,
        ?string $entityType = null,
        ?int $entityId = null,
        array $oldValues = [],
        array $newValues = [],
        ?string $ipAddress = null,
        ?int $userId = null,
        ?string $operatorName = null,
        ?string $operatorRole = null
    ): void {
        try {
            DB::table('audit_logs')->insert([
                'user_id'       => $userId,
                'operator_name' => $operatorName ?? 'Exam Coordinator',
                'operator_role' => $operatorRole ?? 'admin',
                'action'        => $action,
                'entity_type'   => $entityType,
                'entity_id'     => $entityId,
                'old_values'    => !empty($oldValues) ? json_encode($oldValues, JSON_UNESCAPED_UNICODE) : null,
                'new_values'    => !empty($newValues) ? json_encode($newValues, JSON_UNESCAPED_UNICODE) : null,
                'ip_address'    => $ipAddress ?? request()->ip(),
                'created_at'    => now(),
            ]);
        } catch (\Throwable $e) {
            Log::error('AuditLogService Failed', ['error' => $e->getMessage()]);
        }
    }
}
