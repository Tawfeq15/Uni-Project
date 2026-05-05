<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * BlackoutDatesController
 * CRUD for university-wide blocked dates (holidays, maintenance, etc.)
 */
class BlackoutDatesController extends Controller
{
    /** GET /api/blackout-dates */
    public function index()
    {
        $dates = DB::table('blackout_dates')->orderBy('start_date')->get();
        return response()->json(['blackout_dates' => $dates]);
    }

    /** POST /api/blackout-dates */
    public function store(Request $request)
    {
        $data = $request->json()->all();

        if (empty($data['title']) || empty($data['start_date']) || empty($data['end_date'])) {
            return response()->json(['success' => false, 'error' => 'العنوان وتاريخ البداية والنهاية مطلوبة'], 400);
        }

        if ($data['start_date'] > $data['end_date']) {
            return response()->json(['success' => false, 'error' => 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية'], 400);
        }

        $id = DB::table('blackout_dates')->insertGetId([
            'title'      => $data['title'],
            'start_date' => $data['start_date'],
            'end_date'   => $data['end_date'],
            'reason'     => $data['reason'] ?? null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['success' => true, 'blackout_date' => DB::table('blackout_dates')->find($id)]);
    }

    /** DELETE /api/blackout-dates/{id} */
    public function destroy(int $id)
    {
        DB::table('blackout_dates')->where('id', $id)->delete();
        return response()->json(['success' => true]);
    }

    /** GET /api/blackout-dates/check?date=YYYY-MM-DD */
    public function check(Request $request)
    {
        $date    = $request->query('date');
        if (!$date) return response()->json(['blocked' => false, 'reason' => null]);

        $blocked = DB::table('blackout_dates')
            ->where('start_date', '<=', $date)
            ->where('end_date',   '>=', $date)
            ->first();

        return response()->json([
            'blocked' => (bool)$blocked,
            'reason'  => $blocked ? $blocked->title . ($blocked->reason ? ': ' . $blocked->reason : '') : null,
        ]);
    }
}
