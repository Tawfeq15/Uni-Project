<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$files = \Illuminate\Support\Facades\DB::table('uploaded_files')->where('is_active', 1)->get();
$controller = app()->make(\App\Http\Controllers\Api\UploadsController::class);

foreach ($files as $file) {
    echo "Reparsing " . $file->id . PHP_EOL;
    try {
        $res = $controller->reparse($file->id);
        echo "Response: " . $res->getContent() . PHP_EOL;
    } catch (\Exception $e) {
        echo "Error: " . $e->getMessage() . PHP_EOL;
    }
}
echo "Done.\n";
