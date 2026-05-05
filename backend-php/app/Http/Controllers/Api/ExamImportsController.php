<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ExamScheduleImportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class ExamImportsController extends Controller
{
    public function __construct(
        protected ExamScheduleImportService $importService
    ) {}

    // POST /api/exams/import/preview
    public function preview(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'file' => 'required|file|mimes:xlsx,xls,csv',
            'faculty' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'error' => $validator->errors()->first()], 400);
        }

        $importData = $request->only(['faculty', 'academic_year', 'semester', 'exam_period', 'operator_name', 'operator_role']);
        if ($request->has('column_mapping')) {
            $importData['column_mapping'] = json_decode($request->input('column_mapping'), true);
        }
        
        $result = $this->importService->previewFile($request->file('file'), $importData);

        return response()->json($result, $result['success'] ? 200 : 400);
    }

    // POST /api/exams/import/confirm
    public function confirm(Request $request)
    {
        $importId = $request->input('import_id');
        $mode = $request->input('mode', 'import_new'); // preview_only, import_new, replace_existing
        $operatorName = $request->input('operator_name', 'Exam Coordinator');
        $operatorRole = $request->input('operator_role', 'admin');

        if (!$importId) {
            return response()->json(['success' => false, 'error' => 'رقم الاستيراد مطلوب'], 400);
        }

        if ($mode === 'preview_only') {
            return response()->json(['success' => true, 'message' => 'تم حفظ المعاينة بنجاح']);
        }

        $options = [
            'mode' => $mode,
            'operator_name' => $operatorName,
            'operator_role' => $operatorRole,
        ];

        $result = $this->importService->confirmImport($importId, $options);

        return response()->json($result, $result['success'] ? 200 : 400);
    }

    // GET /api/exams/imports
    public function index()
    {
        $imports = DB::table('exam_schedule_imports')->orderByDesc('created_at')->get();
        return response()->json(['imports' => $imports]);
    }

    // GET /api/exams/imports/{id}
    public function show($id)
    {
        $import = DB::table('exam_schedule_imports')->find($id);
        if (!$import) {
            return response()->json(['success' => false, 'error' => 'عملية الاستيراد غير موجودة'], 404);
        }

        $rows = DB::table('exam_schedule_import_rows')->where('import_id', $id)->orderBy('row_number')->get();

        return response()->json(['import' => $import, 'rows' => $rows]);
    }
    
    // DELETE /api/exams/imports/{id}
    public function destroy($id)
    {
        $import = DB::table('exam_schedule_imports')->find($id);
        if (!$import) {
            return response()->json(['success' => false, 'error' => 'عملية الاستيراد غير موجودة'], 404);
        }

        DB::table('exam_schedule_imports')->where('id', $id)->delete();
        return response()->json(['success' => true]);
    }
}
