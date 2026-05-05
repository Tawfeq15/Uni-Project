<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$files = \Illuminate\Support\Facades\DB::table('uploaded_files')->get();
print_r($files->toArray());
