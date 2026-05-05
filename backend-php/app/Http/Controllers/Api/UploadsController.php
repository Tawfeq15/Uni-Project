<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ParserService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class UploadsController extends Controller
{
    public function __construct(protected ParserService $parser) {}

    /** POST /api/uploads */
    public function store(Request $request)
    {
        if (!$request->hasFile('file')) {
            return response()->json(['error' => 'لم يتم رفع أي ملف'], 400);
        }

        $file = $request->file('file');
        $ext  = strtolower($file->getClientOriginalExtension());
        if (!in_array($ext, ['xlsx', 'xls', 'csv'])) {
            return response()->json(['error' => 'يجب أن يكون الملف بصيغة Excel'], 422);
        }

        $stored = $file->store('uploads', 'local');
        $storedPath = Storage::path($stored);

        try {
            $parseResult = $this->parser->parseExcelFile($storedPath);
        } catch (\Throwable $e) {
            return response()->json(['error' => 'فشل تحليل الملف: ' . $e->getMessage()], 422);
        }

        $sessions   = $parseResult['sessions'];
        $rooms      = $parseResult['rooms'];
        $faculties  = $parseResult['faculties'];
        $stats      = $parseResult['stats'];

        $detectedFaculties = $faculties ?: ['unknown'];
        sort($detectedFaculties);
        $facultyLabel = implode(',', $detectedFaculties); // Store exactly what was detected (e.g., 'it,library' or 'architecture,media')

        foreach ($detectedFaculties as $f) {
            DB::table('uploaded_files')->whereRaw('LOWER(faculty) = LOWER(?)', [$f])->update(['is_active' => 0]);
        }

        $fileId = DB::table('uploaded_files')->insertGetId([
            'original_name'  => $file->getClientOriginalName(),
            'stored_path'    => $storedPath,
            'faculty'        => $facultyLabel,
            'is_active'      => 1,
            'upload_status'  => 'uploaded',
            'parse_status'   => 'pending',
            'uploaded_at'    => now(),
        ]);

        try {
            $placeholders = implode(',', array_fill(0, count($detectedFaculties), '?'));
            $oldFiles = DB::select(
                "SELECT id FROM uploaded_files WHERE faculty IN ($placeholders) AND id != ?",
                array_merge($detectedFaculties, [$fileId])
            );
            foreach ($oldFiles as $old) {
                DB::table('parsed_sessions')->where('uploaded_file_id', $old->id)->delete();
            }

            $this->upsertRooms($rooms);
            $this->insertSessions($sessions, $fileId);

            DB::table('uploaded_files')->where('id', $fileId)->update([
                'parse_status'   => 'success',
                'parsed_at'      => now(),
                'sessions_count' => count($sessions),
            ]);

            $fileRecord = DB::table('uploaded_files')->find($fileId);
            return response()->json([
                'success'            => true,
                'message'            => 'تم الرفع وتحليل الملف بنجاح',
                'file'               => $fileRecord,
                'faculties_detected' => $detectedFaculties,
                'sessions_count'     => count($sessions),
                'rooms_count'        => count($rooms),
                'stats'              => $stats,
            ]);
        } catch (\Throwable $e) {
            DB::table('uploaded_files')->where('id', $fileId)->update([
                'parse_status'  => 'error',
                'error_message' => $e->getMessage(),
            ]);
            return response()->json([
                'success'  => true,
                'warning'  => true,
                'message'  => 'تم الرفع لكن فشل التحليل',
                'error'    => $e->getMessage(),
                'file'     => DB::table('uploaded_files')->find($fileId),
            ]);
        }
    }

    /** GET /api/uploads */
    public function index()
    {
        $files = DB::table('uploaded_files')->orderByDesc('uploaded_at')->get();
        return response()->json($files);
    }

    /** DELETE /api/uploads/{id} */
    public function destroy(int $id)
    {
        $file = DB::table('uploaded_files')->find($id);
        if (!$file) return response()->json(['error' => 'الملف غير موجود'], 404);

        if (file_exists($file->stored_path)) @unlink($file->stored_path);
        DB::table('parsed_sessions')->where('uploaded_file_id', $id)->delete();
        DB::table('uploaded_files')->where('id', $id)->delete();

        return response()->json(['success' => true, 'message' => 'تم الحذف بنجاح']);
    }

    /** POST /api/uploads/{id}/reparse */
    public function reparse(int $id)
    {
        $file = DB::table('uploaded_files')->find($id);
        if (!$file) return response()->json(['error' => 'الملف غير موجود'], 404);
        if (!file_exists($file->stored_path)) return response()->json(['error' => 'الملف غير موجود على القرص'], 400);

        DB::table('parsed_sessions')->where('uploaded_file_id', $id)->delete();

        $parseResult = $this->parser->parseExcelFile($file->stored_path);
        ['sessions' => $sessions, 'rooms' => $rooms, 'stats' => $stats] = $parseResult;

        $this->upsertRooms($rooms);
        $this->insertSessions($sessions, $id);

        DB::table('uploaded_files')->where('id', $id)->update([
            'parse_status'   => 'success',
            'parsed_at'      => now(),
            'sessions_count' => count($sessions),
            'error_message'  => null,
        ]);

        return response()->json(['success' => true, 'sessions_count' => count($sessions), 'rooms_count' => count($rooms), 'stats' => $stats]);
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private function insertSessions(array $sessions, int $fileId): void
    {
        $allRooms = DB::table('rooms')->get();
        $roomMap = [];
        foreach ($allRooms as $r) {
            $roomMap[strtolower($r->room_name) . '|' . strtolower($r->faculty)] = $r->id;
        }

        $chunks = array_chunk($sessions, 100);
        foreach ($chunks as $chunk) {
            $rows = array_map(function ($s) use ($fileId, $roomMap) {
                $key = strtolower($s['room'] ?? '') . '|' . strtolower($s['faculty'] ?? '');
                $roomId = $roomMap[$key] ?? null;
                $roomRaw = $roomId ? null : ($s['room'] ?? null);
                
                return array_merge($s, [
                    'uploaded_file_id' => $fileId,
                    'room_id' => $roomId,
                    'room_raw' => $roomRaw,
                ]);
            }, $chunk);
            DB::table('parsed_sessions')->insert($rows);
        }
    }

    private function upsertRooms(array $rooms): void
    {
        foreach ($rooms as $room) {
            $existing = DB::table('rooms')
                ->whereRaw('LOWER(room_name) = LOWER(?)', [$room['room_name']])
                ->whereRaw('LOWER(faculty) = LOWER(?)', [$room['faculty']])
                ->first();

            if ($existing) {
                DB::table('rooms')->where('id', $existing->id)->update([
                    'room_type' => $room['room_type'],
                    'capacity'  => max($existing->capacity, $room['capacity']),
                    'is_active' => 1,
                ]);
            } else {
                DB::table('rooms')->insert([
                    'faculty'   => $room['faculty'],
                    'room_name' => $room['room_name'],
                    'room_type' => $room['room_type'],
                    'capacity'  => $room['capacity'],
                    'is_active' => 1,
                ]);
            }
        }
    }
}
