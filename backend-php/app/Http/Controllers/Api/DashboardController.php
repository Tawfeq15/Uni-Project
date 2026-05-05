<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /** GET /api/dashboard/stats */
    public function stats()
    {
        $uploadedFiles  = DB::table('uploaded_files')->where('is_active', 1)->count();
        $totalFiles     = DB::table('uploaded_files')->count();
        $totalSessions  = DB::table('parsed_sessions as ps')
            ->join('uploaded_files as uf', 'ps.uploaded_file_id', '=', 'uf.id')
            ->where('uf.is_active', 1)->where('ps.is_valid', 1)->count();
        $totalRooms     = DB::table('rooms')->where('is_active', 1)->where('room_type', 'room')->count();
        $totalLabs      = DB::table('rooms')->where('is_active', 1)->where('room_type', 'lab')->count();
        $examRequests   = DB::table('exam_requests')->count();
        $scheduledExams = DB::table('scheduled_exams')->where('status', 'scheduled')->count();
        $unscheduled    = DB::table('exam_requests')->where('status', 'pending')->count();
        $conflicts      = DB::table('conflicts')->where('severity', 'error')->count();

        $byFaculty = DB::table('parsed_sessions as ps')
            ->join('uploaded_files as uf', 'ps.uploaded_file_id', '=', 'uf.id')
            ->where('uf.is_active', 1)->where('ps.is_valid', 1)
            ->selectRaw('ps.faculty, COUNT(*) as sessions, COUNT(DISTINCT ps.room) as rooms')
            ->groupBy('ps.faculty')->get();

        $scheduledByFaculty = DB::table('scheduled_exams')
            ->where('status', 'scheduled')
            ->selectRaw('faculty, COUNT(*) as exams')
            ->groupBy('faculty')->get();

        return response()->json([
            'uploaded_files'        => $uploadedFiles,
            'total_files'           => $totalFiles,
            'total_sessions'        => $totalSessions,
            'total_rooms'           => $totalRooms,
            'total_labs'            => $totalLabs,
            'exam_requests'         => $examRequests,
            'scheduled_exams'       => $scheduledExams,
            'unscheduled_exams'     => $unscheduled,
            'conflicts'             => $conflicts,
            'by_faculty'            => $byFaculty,
            'scheduled_by_faculty'  => $scheduledByFaculty,
        ]);
    }

    /** POST /api/dashboard/reset */
    public function reset()
    {
        DB::transaction(function () {
            // Delete new conflict workflow tables
            DB::table('exam_conflict_items')->delete();
            DB::table('exam_conflict_groups')->delete();
            
            // Delete old conflicts table (if still used)
            DB::table('conflicts')->delete();
            
            // Delete scheduled exams and their relationships
            DB::table('scheduled_exam_sections')->delete();
            DB::table('scheduled_exam_rooms')->delete();
            DB::table('scheduled_exams')->delete();
            
            // Delete requests and import staging tables
            DB::table('exam_requests')->delete();
            DB::table('exam_schedule_import_rows')->delete();
            DB::table('exam_schedule_imports')->delete();
            
            // Delete sessions and files
            DB::table('parsed_sessions')->delete();
            DB::table('uploaded_files')->delete();
            
            // Reset auto-increment sequences (SQLite)
            $tables = [
                'exam_conflict_items', 'exam_conflict_groups', 'conflicts', 
                'scheduled_exam_sections', 'scheduled_exam_rooms', 'scheduled_exams', 
                'exam_requests', 'exam_schedule_import_rows', 'exam_schedule_imports', 
                'parsed_sessions', 'uploaded_files'
            ];
            foreach ($tables as $table) {
                try {
                    DB::statement("UPDATE sqlite_sequence SET seq = 0 WHERE name = '{$table}'");
                } catch (\Throwable $e) { /* ignore */ }
            }
        });

        return response()->json(['success' => true, 'message' => 'تم تفريغ كافة البيانات بنجاح.']);
    }
}
