<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$exams = \Illuminate\Support\Facades\DB::table('scheduled_exams')
    ->select('status', \Illuminate\Support\Facades\DB::raw('count(*) as count'))
    ->groupBy('status')
    ->get();

print_r($exams->toArray());
