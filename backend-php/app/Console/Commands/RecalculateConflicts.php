<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Http\Controllers\Api\ConflictsController;
use App\Services\OccupancyService;
use App\Services\DayNormalizationService;
use App\Services\SchedulingConflictService;

class RecalculateConflicts extends Command
{
    protected $signature   = 'conflicts:recalculate {--dry-run : Show what would change without writing}';
    protected $description = 'Recalculate all system conflicts using the corrected day-aware algorithm';

    public function handle(): int
    {
        $this->info('🔍 بدء إعادة فحص التعارضات...');

        if ($this->option('dry-run')) {
            $this->warn('وضع المعاينة فقط — لن يتم حفظ أي تغييرات.');
        }

        $controller = new ConflictsController(
            app(OccupancyService::class),
            app(DayNormalizationService::class),
            app(SchedulingConflictService::class),
        );

        $response = $controller->rebuild();
        $data     = $response->getData(true);

        $this->info("✅ تمت إعادة الفحص بنجاح:");
        $this->line("  • التعارضات الجديدة المُكتشفة: {$data['conflicts_count']}");
        $this->line("  • التعارضات الخاطئة المُزالة: {$data['false_conflicts_removed']}");
        $this->newLine();
        $this->line($data['message'] ?? '');

        return self::SUCCESS;
    }
}
