<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SessionsController extends Controller
{
    /** GET /api/sessions */
    public function index(Request $request)
    {
        $faculty   = $request->query('faculty');
        $day       = $request->query('day');
        $room      = $request->query('room');
        $lecturer  = $request->query('lecturer');
        $roomType  = $request->query('room_type');
        $fileId    = $request->query('file_id');
        $page      = max(1, (int)$request->query('page', 1));
        $limit     = max(1, (int)$request->query('limit', 100));
        $offset    = ($page - 1) * $limit;

        $query = DB::table('parsed_sessions as ps')
            ->join('uploaded_files as uf', 'ps.uploaded_file_id', '=', 'uf.id')
            ->where('ps.is_valid', 1)
            ->where('uf.is_active', 1);

        if ($faculty)  $query->whereRaw('LOWER(ps.faculty) = LOWER(?)', [$faculty]);
        if ($day)      $query->whereRaw('LOWER(ps.day) = LOWER(?)', [$day]);
        if ($room)     $query->whereRaw('LOWER(ps.room) LIKE LOWER(?)', ["%$room%"]);
        if ($lecturer) $query->whereRaw('LOWER(ps.lecturer) LIKE LOWER(?)', ["%$lecturer%"]);
        if ($roomType) $query->whereRaw('LOWER(ps.room_type) = LOWER(?)', [$roomType]);
        if ($fileId)   $query->where('ps.uploaded_file_id', $fileId);

        $total    = $query->count();
        $sessions = $query->select('ps.*', 'uf.original_name as source_file')
            ->orderBy('ps.faculty')->orderBy('ps.day')->orderBy('ps.start_time')
            ->offset($offset)->limit($limit)->get();

        return response()->json([
            'sessions' => $sessions,
            'total'    => $total,
            'page'     => $page,
            'limit'    => $limit,
        ]);
    }

    /** GET /api/sessions/all-invalid */
    public function allInvalid()
    {
        $sessions = DB::table('parsed_sessions as ps')
            ->join('uploaded_files as uf', 'ps.uploaded_file_id', '=', 'uf.id')
            ->where('ps.is_valid', 0)
            ->select('ps.*', 'uf.original_name as source_file')
            ->orderBy('ps.uploaded_file_id')
            ->get();
        return response()->json(['sessions' => $sessions]);
    }

    /** GET /api/sessions/filters */
    public function filters()
    {
        $faculties  = DB::table('parsed_sessions')->whereNotNull('faculty')->distinct()->pluck('faculty');
        $days       = DB::table('parsed_sessions')->whereNotNull('day')->distinct()->pluck('day');
        $rooms      = DB::table('parsed_sessions')->whereNotNull('room')->distinct()->pluck('room');
        $lecturers  = DB::table('parsed_sessions')->whereNotNull('lecturer')->distinct()->pluck('lecturer');
        $courses    = DB::table('parsed_sessions')->whereNotNull('course_code')->select('course_code', 'course_name')->distinct()->get();

        return response()->json(compact('faculties', 'days', 'rooms', 'lecturers', 'courses'));
    }
}
