<?php
// Run as: php add_conflict_columns.php
// Execute from backend-php directory

require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$cols = array_column(DB::select('DESCRIBE conflicts'), 'Field');

if (!in_array('exam_date', $cols)) {
    DB::statement('ALTER TABLE conflicts ADD COLUMN exam_date DATE NULL AFTER day');
    echo "✓ Added exam_date column\n";
} else {
    echo "– exam_date already exists\n";
}

if (!in_array('details_json', $cols)) {
    DB::statement('ALTER TABLE conflicts ADD COLUMN details_json LONGTEXT NULL AFTER message');
    echo "✓ Added details_json column\n";
} else {
    echo "– details_json already exists\n";
}

echo "Done.\n";
