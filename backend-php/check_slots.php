<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$availSvc = app(App\Services\AvailabilityService::class);

echo "=== getFreeSlots for all labs (no filter) ===\n";
$slots = $availSvc->getFreeSlots(['roomType' => 'lab']);
$room2103 = array_filter($slots, fn($s) => $s['room'] === '2103');
echo "2103 free slots:\n";
foreach ($room2103 as $s) {
    echo "  day={$s['day']} from={$s['available_from']} to={$s['available_to']} dur={$s['duration_minutes']}min\n";
}

echo "\n=== getFreeSlots filtered by day=thursday ===\n";
$slots2 = $availSvc->getFreeSlots(['roomType' => 'lab', 'day' => 'thursday']);
$room2103_thu = array_filter($slots2, fn($s) => $s['room'] === '2103');
echo "2103 thursday free slots:\n";
foreach ($room2103_thu as $s) {
    echo "  day={$s['day']} from={$s['available_from']} to={$s['available_to']} dur={$s['duration_minutes']}min\n";
}
if (empty($room2103_thu)) {
    echo "  NONE FOUND!\n";
}
echo "Total thursday free slots: " . count($slots2) . "\n";
