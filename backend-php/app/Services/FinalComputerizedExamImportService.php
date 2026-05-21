<?php
namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Maatwebsite\Excel\Facades\Excel;
use Carbon\Carbon;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Illuminate\Http\UploadedFile;

class FinalComputerizedExamImportService
{
    public function __construct(
        protected DateTimeNormalizationService  $dtService,
        protected FinalExamLabAssignmentService $labService
    ) {}

    // ── ARABIC HEADER MAP ────────────────────────────────────────────────────
    private array $headerMap = [
        'رقم المادة'     => 'course_code',
        'ش'              => 'section_number',
        'اسم المادة'     => 'course_name',
        'القاعة'         => 'existing_room',
        'اسم المحاضر'    => 'instructor_name',
        'ع'              => 'student_count',
        'طبيعة الامتحان' => 'exam_type',
        'م'              => 'platform',
        'اليوم'          => 'day',
        'التاريخ'        => 'exam_date',
        'الوقت'          => 'time_range',
        'المختبرات'      => 'assigned_labs',
    ];

    // ── PREVIEW ──────────────────────────────────────────────────────────────
    public function previewImport(UploadedFile $file, array $settings): array
    {
        $path         = $file->store('final_computerized_imports');
        $originalName = $file->getClientOriginalName();

        $importId = DB::table('final_computerized_imports')->insertGetId([
            'original_filename' => $originalName,
            'stored_path'       => $path,
            'academic_year'     => $settings['academic_year'] ?? null,
            'semester'          => $settings['semester']      ?? null,
            'exam_period'       => $settings['exam_period']   ?? 'final',
            'faculty'           => $settings['faculty']       ?? null,
            'operator_name'     => $settings['operator_name'] ?? 'Exam Coordinator',
            'operator_role'     => $settings['operator_role'] ?? 'admin',
            'status'            => 'preview',
            'created_at'        => now(),
            'updated_at'        => now(),
        ]);

        try {
            $rows    = $this->readExcelRows($file);
            $mapped  = $this->mapRows($rows);
            $parsed  = $this->parseAndValidate($mapped);
            $groups  = $this->groupRowsByExam($parsed);

            $totalStudents  = 0;
            $validCount     = 0;
            $invalidCount   = 0;
            $rowNumber      = 0;

            foreach ($groups as $group) {
                $totalStudents += $group['total_students'];
                foreach ($group['rows'] as $row) {
                    $rowNumber++;
                    $status = $row['status'];
                    if ($status === 'valid')   $validCount++;
                    if ($status === 'invalid') $invalidCount++;

                    DB::table('final_computerized_import_rows')->insert([
                        'import_id'          => $importId,
                        'row_number'         => $rowNumber,
                        'course_code'        => $row['course_code'],
                        'section_number'     => $row['section_number'],
                        'course_name'        => $row['course_name'],
                        'instructor_name'    => $row['instructor_name'],
                        'student_count'      => $row['student_count'],
                        'exam_type'          => $row['exam_type'],
                        'platform'           => $row['platform'],
                        'day'                => $row['day'],
                        'exam_date'          => $row['exam_date'],
                        'start_time'         => $row['start_time'],
                        'end_time'           => $row['end_time'],
                        'group_key'          => $group['group_key'],
                        'status'             => $status,
                        'errors'             => json_encode($row['errors'] ?? []),
                        'warnings'           => json_encode($row['warnings'] ?? []),
                        'raw_data'           => json_encode($row['raw'] ?? []),
                        'created_at'         => now(),
                        'updated_at'         => now(),
                    ]);
                }
            }

            DB::table('final_computerized_imports')->where('id', $importId)->update([
                'total_rows'    => $rowNumber,
                'valid_rows'    => $validCount,
                'invalid_rows'  => $invalidCount,
                'total_students'=> $totalStudents,
                'updated_at'    => now(),
            ]);

            return [
                'success'        => true,
                'import_id'      => $importId,
                'total_rows'     => $rowNumber,
                'valid_rows'     => $validCount,
                'invalid_rows'   => $invalidCount,
                'total_students' => $totalStudents,
                'groups_count'   => count($groups),
            ];
        } catch (\Throwable $e) {
            Log::error('FinalComputerizedImport preview failed: ' . $e->getMessage());
            DB::table('final_computerized_imports')->where('id', $importId)->delete();
            return ['success' => false, 'message' => 'فشل في قراءة الملف: ' . $e->getMessage()];
        }
    }

    // ── ASSIGN LABS ──────────────────────────────────────────────────────────
    public function assignLabs(int $importId): array
    {
        // ── Reset previously assigned rows so re-assignment starts fresh ──────
        // Without this, rows still holding status='assigned' from a previous run
        // would cause findAvailableLabs to falsely see library/IT labs as occupied.
        DB::table('final_computerized_import_rows')
            ->where('import_id', $importId)
            ->whereIn('status', ['assigned', 'needs_review', 'conflict'])
            ->update([
                'status'            => 'valid',
                'assigned_labs'     => null,
                'assigned_capacity' => 0,
                'updated_at'        => now(),
            ]);

        $rows = DB::table('final_computerized_import_rows')
            ->where('import_id', $importId)
            ->whereIn('status', ['valid', 'pending'])
            ->get();

        if ($rows->isEmpty()) {
            return ['success' => false, 'message' => 'لا توجد صفوف صالحة للتوزيع'];
        }

        // Build groups: include course_name + course_code so the lab-assignment
        // service can detect IT-related courses and prefer IT labs for them.
        $groups = [];
        foreach ($rows as $row) {
            $key = $row->group_key ?? md5($row->course_code . '|' . $row->exam_date . '|' . $row->start_time);
            if (!isset($groups[$key])) {
                $groups[$key] = [
                    'group_key'      => $key,
                    'exam_date'      => $row->exam_date,
                    'start_time'     => $row->start_time,
                    'end_time'       => $row->end_time,
                    'total_students' => 0,
                    'row_ids'        => [],
                    'course_name'    => $row->course_name   ?? '',
                    'course_code'    => $row->course_code   ?? '',
                ];
            }
            $groups[$key]['total_students'] += (int)$row->student_count;
            $groups[$key]['row_ids'][]       = $row->id;
        }

        $assigned     = 0;
        $needsReview  = 0;

        $assignedGroups = $this->labService->assignLabsForGroups(
            array_values($groups), $importId
        );

        foreach ($assignedGroups as $group) {
            $labsJson = json_encode($group['assigned_labs'] ?? []);
            $cap      = $group['assigned_capacity'] ?? 0;
            $status   = $group['status'];
            $notes    = $group['notes'] ?? null;

            if ($status === 'assigned') $assigned++;
            else                        $needsReview++;

            DB::table('final_computerized_import_rows')
                ->whereIn('id', $group['row_ids'])
                ->update([
                    'assigned_labs'     => $labsJson,
                    'assigned_capacity' => $cap,
                    'status'            => $status,
                    'warnings'          => json_encode($notes ? [$notes] : []),
                    'updated_at'        => now(),
                ]);
        }

        DB::table('final_computerized_imports')->where('id', $importId)->update([
            'status'           => 'assigned',
            'assigned_rows'    => $assigned,
            'needs_review_rows'=> $needsReview,
            'updated_at'       => now(),
        ]);

        app(AuditLogService::class)->log(
            action: 'final_computerized_labs_assigned',
            entityType: 'final_computerized_import',
            entityId: $importId,
            newValues: ['assigned' => $assigned, 'needs_review' => $needsReview]
        );

        return [
            'success'      => true,
            'assigned'     => $assigned,
            'needs_review' => $needsReview,
        ];
    }

    // ── CONFIRM ──────────────────────────────────────────────────────────────
    public function confirmImport(int $importId, array $options = []): array
    {
        $import = DB::table('final_computerized_imports')->find($importId);
        if (!$import) {
            return ['success' => false, 'message' => 'عملية الاستيراد غير موجودة'];
        }

        $rows = DB::table('final_computerized_import_rows')
            ->where('import_id', $importId)
            ->where('status', 'assigned')
            ->get();

        if ($rows->isEmpty()) {
            return ['success' => false, 'message' => 'لا توجد صفوف معتمدة للتأكيد. قم بتوزيع المختبرات أولاً'];
        }

        // Group by group_key to insert one scheduled_exam per group
        $groups = [];
        foreach ($rows as $row) {
            $key = $row->group_key ?? $row->id;
            if (!isset($groups[$key])) {
                $groups[$key] = [
                    'rows'        => [],
                    'exam_date'   => $row->exam_date,
                    'start_time'  => $row->start_time,
                    'end_time'    => $row->end_time,
                    'exam_type'   => $row->exam_type,
                    'platform'    => $row->platform,
                    'day'         => $row->day,
                    'assigned_labs' => json_decode($row->assigned_labs ?? '[]', true) ?? [],
                ];
            }
            $groups[$key]['rows'][] = $row;
        }

        $imported = 0;
        DB::beginTransaction();
        try {
            foreach ($groups as $group) {
                $groupRows    = $group['rows'];
                $firstRow     = $groupRows[0];
                $labs         = $group['assigned_labs'];

                $totalStudents  = array_sum(array_column(
                    array_map(fn($r) => ['student_count' => $r->student_count], $groupRows),
                    'student_count'
                ));
                $totalCapacity  = array_sum(array_column($labs, 'capacity'));
                $instructors    = array_unique(array_filter(
                    array_map(fn($r) => $r->instructor_name, $groupRows)
                ));
                $labNames       = array_column($labs, 'lab_name');
                $sections       = array_map(fn($r) => $r->section_number, $groupRows);

                $examId = DB::table('scheduled_exams')->insertGetId([
                    'faculty'       => $import->faculty,
                    'day'           => $group['day'],
                    'exam_date'     => $group['exam_date'],
                    'start_time'    => $group['start_time'],
                    'end_time'      => $group['end_time'],
                    'duration_minutes' => $this->calcDuration($group['start_time'], $group['end_time']),
                    'lecturer'      => implode('، ', array_filter($instructors)),
                    'rooms_json'    => json_encode($labNames),
                    'total_capacity'=> $totalCapacity,
                    'student_count' => $totalStudents,
                    'course_code'   => $firstRow->course_code,
                    'course_name'   => $firstRow->course_name,
                    'section'       => implode(',', array_filter($sections)),
                    'status'        => 'scheduled',
                    'academic_year' => $import->academic_year,
                    'semester'      => $import->semester,
                    'exam_period'   => 'final',
                    'source_type'   => 'final_computerized_import',
                    'import_id'     => $importId,
                    'created_at'    => now(),
                    'updated_at'    => now(),
                ]);

                // Insert scheduled_exam_rooms
                foreach ($labs as $lab) {
                    $roomObj = DB::table('rooms')->where('room_name', $lab['lab_name'])->first();
                    DB::table('scheduled_exam_rooms')->insert([
                        'scheduled_exam_id'       => $examId,
                        'room_id'                 => $roomObj?->id,
                        'room_name'               => $lab['lab_name'],
                        'assigned_students_count' => min($lab['capacity'], $totalStudents),
                        'created_at'              => now(),
                        'updated_at'              => now(),
                    ]);
                }

                // Insert scheduled_exam_sections
                foreach ($groupRows as $r) {
                    DB::table('scheduled_exam_sections')->insert([
                        'scheduled_exam_id' => $examId,
                        'course_code'       => $r->course_code,
                        'course_name'       => $r->course_name,
                        'section_key'       => $r->section_number ?? '',
                        'section_number'    => $r->section_number,
                        'instructor_name'   => $r->instructor_name,
                        'student_count'     => $r->student_count,
                        'metadata'          => json_encode([
                            'exam_type' => $r->exam_type,
                            'platform'  => $r->platform,
                        ]),
                        'created_at'        => now(),
                    ]);
                }

                // Mark rows as imported
                DB::table('final_computerized_import_rows')
                    ->whereIn('id', array_column($groupRows, 'id'))
                    ->update(['status' => 'imported', 'updated_at' => now()]);

                $imported++;
            }

            DB::table('final_computerized_imports')->where('id', $importId)->update([
                'status'     => 'confirmed',
                'updated_at' => now(),
            ]);

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error('FinalComputerizedImport confirm failed: ' . $e->getMessage());
            return ['success' => false, 'message' => 'فشل في حفظ البيانات: ' . $e->getMessage()];
        }

        app(AuditLogService::class)->log(
            action: 'final_computerized_import_confirmed',
            entityType: 'final_computerized_import',
            entityId: $importId,
            newValues: ['imported_exams' => $imported]
        );

        return ['success' => true, 'imported' => $imported];
    }

    // ── EXPORT EXCEL ─────────────────────────────────────────────────────────
    /**
     * Export: Loads the ORIGINAL uploaded file, fills the المختبرات column
     * for each row in-place, and returns the path to download.
     *
     * Output format matches the original input (Image 1 style).
     * Paper exam rows (ورقي) are left blank in المختبرات.
     */
    public function exportExcel(int $importId): ?string
    {
        $import = DB::table('final_computerized_imports')->find($importId);
        if (!$import) return null;

        // Build lookup: course_code|section_number|exam_date → assigned_labs JSON
        $dbRows  = DB::table('final_computerized_import_rows')
            ->where('import_id', $importId)
            ->get();

        $labLookup = [];
        foreach ($dbRows as $row) {
            // Primary key: exact match on code + section + date
            $key = trim((string)($row->course_code ?? ''))
                 . '|' . trim((string)($row->section_number ?? ''))
                 . '|' . trim((string)($row->exam_date ?? ''));
            $labLookup[$key] = $row->assigned_labs ?? '[]';

            // Fallback key: code + date (without section, for merged rows)
            $keyNoSection = trim((string)($row->course_code ?? ''))
                          . '|' . trim((string)($row->exam_date ?? ''));
            if (!isset($labLookup[$keyNoSection])) {
                $labLookup[$keyNoSection] = $row->assigned_labs ?? '[]';
            }
        }

        // Try original stored file first
        $storedPath = storage_path('app/' . $import->stored_path);
        if (file_exists($storedPath)) {
            return $this->fillOriginalFile($storedPath, $importId, $labLookup);
        }

        // Fallback: build from DB rows
        return $this->buildFallbackExport($importId, $dbRows);
    }

    /**
     * Load original Excel file, locate المختبرات column, fill it row by row.
     */
    private function fillOriginalFile(
        string $storedPath,
        int    $importId,
        array  $labLookup
    ): ?string {
        try {
            $spreadsheet = IOFactory::load($storedPath);

            // Prefer FINAL sheet
            $sheet = null;
            foreach ($spreadsheet->getSheetNames() as $name) {
                if (strtoupper(trim($name)) === 'FINAL') {
                    $sheet = $spreadsheet->getSheetByName($name);
                    break;
                }
            }
            if (!$sheet) {
                $sheet = $spreadsheet->getActiveSheet();
            }
            $sheet->setRightToLeft(true);

            $maxRow = $sheet->getHighestRow();
            $maxColLetter = $sheet->getHighestColumn();
            $maxColIdx = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::columnIndexFromString($maxColLetter);

            // ── Find header row & key column positions ────────────────────
            $headerRowNum    = null;
            $labsColIdx      = null;
            $courseCodeColIdx = null;
            $sectionColIdx   = null;
            $dateColIdx      = null;
            $examTypeColIdx  = null;

            for ($r = 1; $r <= min($maxRow, 15); $r++) {
                $rowHasHeader = false;
                for ($c = 1; $c <= $maxColIdx; $c++) {
                    $val = trim((string)$sheet->getCellByColumnAndRow($c, $r)->getValue());
                    if ($val === 'رقم المادة' || $val === 'اسم المادة') {
                        $headerRowNum = $r;
                        $rowHasHeader = true;
                        break;
                    }
                }
                if ($rowHasHeader) {
                    // Map all headers in this row
                    for ($c = 1; $c <= $maxColIdx; $c++) {
                        $val = trim((string)$sheet->getCellByColumnAndRow($c, $r)->getValue());
                        switch ($val) {
                            case 'رقم المادة':    $courseCodeColIdx = $c; break;
                            case 'ش':             $sectionColIdx    = $c; break;
                            case 'التاريخ':       $dateColIdx       = $c; break;
                            case 'طبيعة الامتحان':$examTypeColIdx   = $c; break;
                            case 'المختبرات':     $labsColIdx       = $c; break;
                        }
                    }
                    break;
                }
            }

            if (!$headerRowNum) {
                Log::warning("exportExcel: cannot find header row in stored file for import #{$importId}");
                return null;
            }

            // If no المختبرات column exists, add one after the last column
            if (!$labsColIdx) {
                $labsColIdx = $maxColIdx + 1;
                $sheet->setCellValueByColumnAndRow($labsColIdx, $headerRowNum, 'المختبرات');
                $headerStyle = $sheet->getStyleByColumnAndRow($labsColIdx, $headerRowNum);
                $headerStyle->getFont()->setBold(true);
                $sheet->getColumnDimensionByColumn($labsColIdx)->setWidth(55);
            }

            // ── Fill data rows ────────────────────────────────────────────
            // Track last seen non-empty code/section/date for merged-cell rows
            $lastCourseCode = '';
            $lastSection    = '';
            $lastDate       = null;
            $lastTimeKey    = null;   // date|start|end — to detect group changes

            // Blue fill for separator rows
            $blueStyle = [
                'fillType'  => \PhpOffice\PhpSpreadsheet\Style\Fill::FILL_SOLID,
                'startColor'=> ['argb' => 'FF3B5998'],
            ];

            for ($r = $headerRowNum + 1; $r <= $maxRow; $r++) {
                // Get cell values (handle merged cells via calculated value)
                $rawCode  = $courseCodeColIdx
                    ? $sheet->getCellByColumnAndRow($courseCodeColIdx, $r)->getCalculatedValue()
                    : null;
                $rawSect  = $sectionColIdx
                    ? $sheet->getCellByColumnAndRow($sectionColIdx, $r)->getCalculatedValue()
                    : null;
                $rawDate  = $dateColIdx
                    ? $sheet->getCellByColumnAndRow($dateColIdx, $r)->getCalculatedValue()
                    : null;
                $rawType  = $examTypeColIdx
                    ? $sheet->getCellByColumnAndRow($examTypeColIdx, $r)->getCalculatedValue()
                    : null;

                $code = trim((string)$rawCode);
                $sect = trim((string)$rawSect);
                $type = trim((string)$rawType);

                // Update last-seen values (for merged cells that carry down)
                if ($code !== '') $lastCourseCode = $code;
                if ($sect !== '') $lastSection    = $sect;
                if ($rawDate)     $lastDate       = $rawDate;

                // Skip completely empty rows (no code at all even from carry)
                if ($lastCourseCode === '') continue;

                // Paper exams → leave blank
                if (mb_strpos($type, 'ورقي') !== false) {
                    $sheet->setCellValueByColumnAndRow($labsColIdx, $r, '');
                    continue;
                }

                // Normalize date for lookup
                $normalizedDate = $this->dtService->normalizeDate($lastDate);

                // Try primary key first (with section), then fallback (without)
                $key          = $lastCourseCode . '|' . $lastSection . '|' . ($normalizedDate ?? '');
                $keyNoSection = $lastCourseCode . '|' . ($normalizedDate ?? '');

                $labsJson = $labLookup[$key] ?? $labLookup[$keyNoSection] ?? null;

                if ($labsJson) {
                    $labs     = json_decode($labsJson, true) ?? [];
                    $labNames = implode('، ', array_column($labs, 'lab_name'));
                    $sheet->setCellValueByColumnAndRow($labsColIdx, $r, $labNames);
                }
            }


            // ── Save ──────────────────────────────────────────────────────
            $writer  = new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($spreadsheet);
            $tmpPath = sys_get_temp_dir() . '/final_exam_export_' . $importId . '.xlsx';
            $writer->save($tmpPath);
            return $tmpPath;

        } catch (\Throwable $e) {
            Log::error('exportExcel fillOriginalFile failed: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Fallback export when original file is missing.
     * Builds a clean sheet matching Image 1's column order.
     */
    private function buildFallbackExport(int $importId, $dbRows): string
    {
        $spreadsheet = new \PhpOffice\PhpSpreadsheet\Spreadsheet();
        $sheet       = $spreadsheet->getActiveSheet();
        $sheet->setRightToLeft(true);

        // Headers matching original file format
        $headers = [
            'رقم المادة', 'ش', 'اسم المادة', 'القاعة',
            'اسم المحاضر', 'ع', 'طبيعة الامتحان', 'م',
            'اليوم', 'التاريخ', 'الوقت', 'المختبرات',
        ];
        foreach ($headers as $i => $h) {
            $sheet->setCellValueByColumnAndRow($i + 1, 1, $h);
        }

        $r = 2;
        foreach ($dbRows as $row) {
            $labs      = json_decode($row->assigned_labs ?? '[]', true) ?? [];
            $labNames  = implode('، ', array_column($labs, 'lab_name'));
            $timeRange = '';
            if ($row->start_time && $row->end_time) {
                $s = substr($row->start_time, 0, 5);
                $e = substr($row->end_time,   0, 5);
                $timeRange = "{$e} - {$s}";   // RTL format: end - start as in original
            }

            $sheet->setCellValueByColumnAndRow(1,  $r, $row->course_code);
            $sheet->setCellValueByColumnAndRow(2,  $r, $row->section_number);
            $sheet->setCellValueByColumnAndRow(3,  $r, $row->course_name);
            $sheet->setCellValueByColumnAndRow(4,  $r, '');  // القاعة empty (computerized)
            $sheet->setCellValueByColumnAndRow(5,  $r, $row->instructor_name);
            $sheet->setCellValueByColumnAndRow(6,  $r, $row->student_count);
            $sheet->setCellValueByColumnAndRow(7,  $r, $row->exam_type);
            $sheet->setCellValueByColumnAndRow(8,  $r, $row->platform);
            $sheet->setCellValueByColumnAndRow(9,  $r, $row->day);
            $sheet->setCellValueByColumnAndRow(10, $r, $row->exam_date);
            $sheet->setCellValueByColumnAndRow(11, $r, $timeRange);
            $sheet->setCellValueByColumnAndRow(12, $r, $labNames);
            $r++;
        }

        $writer  = new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($spreadsheet);
        $tmpPath = sys_get_temp_dir() . '/final_exam_fallback_' . $importId . '.xlsx';
        $writer->save($tmpPath);
        return $tmpPath;
    }


    // ── INTERNAL HELPERS ─────────────────────────────────────────────────────

    private function readExcelRows(UploadedFile $file): array
    {
        try {
            $realPath = $file->getRealPath();
            $inputFileType = IOFactory::identify($realPath);
            $reader = IOFactory::createReader($inputFileType);
            $reader->setReadDataOnly(true);

            // Get sheet names and only load the target sheet
            $sheetNames = $reader->listWorksheetNames($realPath);
            
            $targetSheet = null;
            foreach ($sheetNames as $name) {
                if (strtoupper(trim($name)) === 'FINAL') {
                    $targetSheet = $name;
                    break;
                }
            }

            if (!$targetSheet && !empty($sheetNames)) {
                $targetSheet = $sheetNames[0];
            }

            if ($targetSheet) {
                $reader->setLoadSheetsOnly([$targetSheet]);
            }

            $spreadsheet = $reader->load($realPath);
            $sheet = $spreadsheet->getActiveSheet();

            return $sheet->toArray(null, true, true, false);
        } catch (\Throwable $e) {
            Log::error('FinalComputerizedImport readExcelRows failed: ' . $e->getMessage());
            throw $e;
        }
    }

    private function mapRows(array $rawRows): array
    {
        if (empty($rawRows)) return [];

        // Find header row (first row with Arabic header keywords)
        $headerRow = null;
        $headerIdx = 0;
        foreach ($rawRows as $idx => $row) {
            $joined = implode('|', array_map(fn($v) => trim((string)$v), $row));
            if (str_contains($joined, 'رقم المادة') || str_contains($joined, 'اسم المادة')) {
                $headerRow = $row;
                $headerIdx = $idx;
                break;
            }
        }

        if (!$headerRow) return [];

        // Build column index map
        $colMap = [];
        foreach ($headerRow as $colIdx => $header) {
            $h = trim((string)$header);
            if (isset($this->headerMap[$h])) {
                $colMap[$this->headerMap[$h]] = $colIdx;
            }
        }

        // Extract data rows
        $dataRows = [];
        for ($i = $headerIdx + 1; $i < count($rawRows); $i++) {
            $row = $rawRows[$i];
            // Skip fully empty rows
            if (empty(array_filter(array_map('trim', array_map('strval', $row))))) {
                continue;
            }
            $mapped = [];
            foreach ($colMap as $field => $idx) {
                $val = isset($row[$idx]) ? trim((string)$row[$idx]) : null;
                $mapped[$field] = ($val === '' ? null : $val);
            }
            $mapped['_raw'] = $row;
            $dataRows[] = $mapped;
        }

        return $dataRows;
    }

    private function parseAndValidate(array $rows): array
    {
        $parsed = [];
        foreach ($rows as $raw) {
            // Skip paper exams (ورقي) entirely as requested
            $examType = trim((string)($raw['exam_type'] ?? ''));
            if (mb_strpos($examType, 'ورقي') !== false) {
                continue;
            }

            $errors   = [];
            $warnings = [];

            // Normalize time range
            $timeRange  = $raw['time_range'] ?? null;
            $startTime  = null;
            $endTime    = null;
            if ($timeRange) {
                $t = $this->dtService->normalizeTimeRange($timeRange);
                $startTime = $t['start_time'];
                $endTime   = $t['end_time'];
            }

            // Normalize date
            $examDate = $this->dtService->normalizeDate($raw['exam_date'] ?? null);

            // Day from date
            $day = null;
            if ($examDate) {
                $day = $this->dtService->calculateArabicDayFromDate($examDate);
            }
            if (empty($day) && !empty($raw['day'])) {
                $day = $raw['day'];
            }

            // Validate required fields
            $cc = $raw['course_code'] ?? null;
            $cn = $raw['course_name'] ?? null;
            $sc = (int)($raw['student_count'] ?? 0);

            if (!$cc) $errors[] = 'رقم المادة مفقود';
            if (!$cn) $warnings[] = 'اسم المادة مفقود';
            if (!$sc) $errors[] = 'عدد الطلبة مفقود أو صفر';
            if (!$examDate) $errors[] = 'التاريخ غير صالح';
            if (!$startTime || !$endTime) $errors[] = 'الوقت غير صالح';

            $parsed[] = [
                'course_code'     => $cc,
                'section_number'  => $raw['section_number'] ?? null,
                'course_name'     => $cn,
                'instructor_name' => $raw['instructor_name'] ?? null,
                'student_count'   => $sc,
                'exam_type'       => $raw['exam_type'] ?? null,
                'platform'        => $raw['platform'] ?? null,
                'day'             => $day,
                'exam_date'       => $examDate,
                'start_time'      => $startTime,
                'end_time'        => $endTime,
                'status'          => empty($errors) ? 'valid' : 'invalid',
                'errors'          => $errors,
                'warnings'        => $warnings,
                'raw'             => $raw['_raw'] ?? [],
            ];
        }
        return $parsed;
    }

    private function groupRowsByExam(array $rows): array
    {
        $groups = [];
        foreach ($rows as $row) {
            $key = md5(
                ($row['course_code']  ?? '') . '|' .
                ($row['exam_date']    ?? '') . '|' .
                ($row['start_time']   ?? '') . '|' .
                ($row['end_time']     ?? '') . '|' .
                ($row['exam_type']    ?? '') . '|' .
                ($row['platform']     ?? '')
            );
            if (!isset($groups[$key])) {
                $groups[$key] = [
                    'group_key'      => $key,
                    'total_students' => 0,
                    'exam_date'      => $row['exam_date'],
                    'start_time'     => $row['start_time'],
                    'end_time'       => $row['end_time'],
                    'rows'           => [],
                ];
            }
            $groups[$key]['total_students'] += $row['student_count'];
            $row['group_key'] = $key;
            $groups[$key]['rows'][] = $row;
        }
        return array_values($groups);
    }

    private function calcDuration(?string $start, ?string $end): int
    {
        if (!$start || !$end) return 60;
        try {
            $s = Carbon::parse($start);
            $e = Carbon::parse($end);
            $d = abs($e->diffInMinutes($s));
            return $d ?: 60;
        } catch (\Throwable $e) { return 60; }
    }
}
