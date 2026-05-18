<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\FinalComputerizedExamImportService;
use App\Services\FinalExamLabAssignmentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FinalComputerizedImportController extends Controller
{
    public function __construct(
        protected FinalComputerizedExamImportService $importService,
        protected FinalExamLabAssignmentService      $labService
    ) {}

    // POST /api/final-computerized-imports/preview
    public function preview(Request $request)
    {
        set_time_limit(120);

        if (!$request->hasFile('file')) {
            return response()->json(['success' => false, 'message' => 'الملف مطلوب'], 400);
        }

        $settings = $request->only([
            'academic_year','semester','exam_period','faculty',
            'operator_name','operator_role',
        ]);

        $result = $this->importService->previewImport($request->file('file'), $settings);

        return response()->json($result, $result['success'] ? 200 : 400);
    }

    // POST /api/final-computerized-imports/{id}/assign-labs
    public function assignLabs(Request $request, int $id)
    {
        set_time_limit(120);
        $result = $this->importService->assignLabs($id);
        return response()->json($result, $result['success'] ? 200 : 400);
    }

    // POST /api/final-computerized-imports/{id}/confirm
    public function confirm(Request $request, int $id)
    {
        set_time_limit(120);
        $result = $this->importService->confirmImport($id, $request->all());
        return response()->json($result, $result['success'] ? 200 : 400);
    }

    // GET /api/final-computerized-imports
    public function index()
    {
        $imports = DB::table('final_computerized_imports')
            ->orderByDesc('created_at')
            ->get();
        return response()->json(['success' => true, 'data' => $imports]);
    }

    // GET /api/final-computerized-imports/{id}
    public function show(int $id)
    {
        $import = DB::table('final_computerized_imports')->find($id);
        if (!$import) {
            return response()->json(['success' => false, 'message' => 'غير موجود'], 404);
        }
        return response()->json(['success' => true, 'data' => $import]);
    }

    // GET /api/final-computerized-imports/{id}/rows
    public function rows(int $id)
    {
        $rows = DB::table('final_computerized_import_rows')
            ->where('import_id', $id)
            ->orderBy('row_number')
            ->get();
        return response()->json(['success' => true, 'data' => $rows]);
    }

    // GET /api/final-computerized-imports/{id}/export-excel
    public function exportExcel(int $id)
    {
        $path = $this->importService->exportExcel($id);
        if (!$path || !file_exists($path)) {
            return response()->json(['success' => false, 'message' => 'فشل التصدير'], 500);
        }
        return response()->download($path, "final_exam_import_{$id}.xlsx")->deleteFileAfterSend();
    }

    // GET /api/final-computerized-imports/available-labs
    public function availableLabs()
    {
        $data = $this->labService->getAvailableLabsSummary();
        return response()->json(['success' => true, 'data' => $data]);
    }
}
