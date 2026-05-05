<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\RoomAvailabilityService;
use App\Services\DateTimeNormalizationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RoomsController extends Controller
{
    public function __construct(
        private RoomAvailabilityService $roomAvailabilityService,
        private DateTimeNormalizationService $dtService
    ) {}

    /** GET /api/rooms */
    public function index(Request $request)
    {
        $query = DB::table('rooms');
        if ($faculty = $request->query('faculty')) {
            $query->whereRaw('LOWER(faculty) = LOWER(?)', [$faculty]);
        }
        return response()->json($query->orderBy('room_name')->get());
    }

    /**
     * GET /api/rooms/available
     * Returns available rooms for a given exam date/time with recommended combinations.
     */
    public function available(Request $request)
    {
        $examDate    = $request->query('exam_date');
        $startTime   = $this->dtService->normalizeTime($request->query('start_time', ''));
        $endTime     = $this->dtService->normalizeTime($request->query('end_time', ''));
        $studentCount= (int)$request->query('capacity_required', 0);
        $excludeId   = $request->query('exclude_exam_id');
        $faculty     = $request->query('faculty');
        $roomType    = $request->query('room_type');
        $courseCode  = $request->query('course_code');
        $courseName  = $request->query('course_name');
        // selected_sections can be passed as repeated ?selected_sections[]=...
        $selectedSections = $request->query('selected_sections', []);
        $selectionMode    = $request->query('selection_mode', 'selected_sections');

        if (!$examDate || !$startTime || !$endTime) {
            return response()->json([
                'success' => false,
                'message' => 'exam_date, start_time, end_time are required',
            ], 422);
        }

        $result = $this->roomAvailabilityService->getAvailableRooms([
            'exam_date'         => $examDate,
            'start_time'        => $startTime,
            'end_time'          => $endTime,
            'student_count'     => $studentCount,
            'course_code'       => $courseCode,
            'course_name'       => $courseName,
            'selected_sections' => is_array($selectedSections) ? $selectedSections : [$selectedSections],
            'selection_mode'    => $selectionMode,
            'exclude_exam_id'   => $excludeId ? (int)$excludeId : null,
            'faculty'           => $faculty,
            'room_type'         => $roomType,
        ]);

        return response()->json(array_merge(['success' => true], $result));
    }

    /** POST /api/rooms */
    public function store(Request $request)
    {
        $data = $request->validate([
            'room_name' => 'required|string',
            'faculty' => 'required|string',
            'room_type' => 'required|string',
            'capacity' => 'required|integer',
            'vlan_id' => 'nullable|integer',
            'subnet_pattern' => 'nullable|string',
            'is_active' => 'required|boolean',
            'notes' => 'nullable|string',
        ]);

        $exists = DB::table('rooms')
            ->where('room_name', $data['room_name'])
            ->where('faculty', $data['faculty'])
            ->exists();

        if ($exists) {
            return response()->json(['error' => 'القاعة موجودة مسبقاً في هذه الكلية'], 400);
        }

        $id = DB::table('rooms')->insertGetId($data);
        return response()->json(['success' => true, 'room' => DB::table('rooms')->find($id)]);
    }

    /** PUT /api/rooms/{id} */
    public function update(Request $request, int $id)
    {
        $data = $request->validate([
            'room_name' => 'required|string',
            'faculty' => 'required|string',
            'room_type' => 'required|string',
            'capacity' => 'required|integer',
            'vlan_id' => 'nullable|integer',
            'subnet_pattern' => 'nullable|string',
            'is_active' => 'required|boolean',
            'notes' => 'nullable|string',
        ]);

        $exists = DB::table('rooms')
            ->where('room_name', $data['room_name'])
            ->where('faculty', $data['faculty'])
            ->where('id', '!=', $id)
            ->exists();

        if ($exists) {
            return response()->json(['error' => 'اسم القاعة موجود مسبقاً في هذه الكلية'], 400);
        }

        DB::table('rooms')->where('id', $id)->update($data);
        return response()->json(['success' => true, 'room' => DB::table('rooms')->find($id)]);
    }

    /** DELETE /api/rooms/{id} */
    public function destroy(int $id)
    {
        DB::table('rooms')->where('id', $id)->delete();
        return response()->json(['success' => true]);
    }
}
