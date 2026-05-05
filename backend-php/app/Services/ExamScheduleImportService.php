<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Maatwebsite\Excel\Facades\Excel;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class ExamScheduleImportService
{
    public function __construct(
        protected DateTimeNormalizationService $dtService,
        protected DuplicateExamBookingService $duplicateService,
        protected SchedulingConflictService $conflictService
    ) {}

    public function previewFile($file, array $importData)
    {
        $path = $file->store('exam_imports');
        $originalName = $file->getClientOriginalName();

        $importId = DB::table('exam_schedule_imports')->insertGetId([
            'faculty'           => $importData['faculty'],
            'academic_year'     => $importData['academic_year'] ?? null,
            'semester'          => $importData['semester'] ?? null,
            'exam_period'       => $importData['exam_period'] ?? null,
            'original_filename' => $originalName,
            'stored_path'       => $path,
            'operator_name'     => $importData['operator_name'] ?? 'Exam Coordinator',
            'operator_role'     => $importData['operator_role'] ?? 'admin',
            'status'            => 'preview',
            'created_at'        => now(),
            'updated_at'        => now(),
        ]);

        // Parse Excel
        $rows = Excel::toArray(new \App\Imports\ScheduleImport(), $file)[0];
        if (empty($rows)) {
            return ['success' => false, 'message' => 'الملف فارغ أو غير صالح'];
        }

        $headers = array_shift($rows);
        
        $headerMap = [];
        if (!empty($importData['column_mapping'])) {
            // Apply manual mapping from UI
            foreach ($importData['column_mapping'] as $systemField => $colIndex) {
                if (is_numeric($colIndex) && $colIndex !== '') {
                    $headerMap[$systemField] = (int)$colIndex;
                }
            }
        } else {
            $headerMap = $this->mapHeaders($headers);
            // Check if required columns exist
            $missingRequired = [];
            if (!isset($headerMap['course_code'])) $missingRequired[] = 'كود المادة';
            if (!isset($headerMap['date'])) $missingRequired[] = 'التاريخ';
            if (!isset($headerMap['rooms'])) $missingRequired[] = 'القاعات';
            if (!isset($headerMap['start_time']) && !isset($headerMap['time'])) $missingRequired[] = 'الوقت';
            
            if (!empty($missingRequired)) {
                return [
                    'success' => false,
                    'needs_mapping' => true,
                    'headers' => $headers,
                    'message' => 'لم يتم التعرف على بعض الأعمدة الأساسية تلقائيًا: ' . implode('، ', $missingRequired) . '. يرجى تحديد الأعمدة يدويًا.'
                ];
            }
        }

        $validCount = 0;
        $invalidCount = 0;
        $warningCount = 0;
        $conflictCount = 0;
        $totalCount = 0;

        // Carry-forward state
        $lastDay = null;
        $lastDate = null;
        $lastStartTime = null;
        $lastEndTime = null;

        // Pass 1: Parse and validate each row
        $parsedRows = [];

        foreach ($rows as $index => $row) {
            // Skip completely empty rows
            if (empty(array_filter($row))) continue;

            $totalCount++;
            $rowData = $this->extractRowData($row, $headerMap);
            
            // Carry forward logic for merged cells
            if (empty($rowData['day']) && $lastDay) $rowData['day'] = $lastDay;
            if (empty($rowData['date']) && $lastDate) $rowData['date'] = $lastDate;
            if (empty($rowData['time']) && empty($rowData['start_time']) && empty($rowData['end_time'])) {
                 if ($lastStartTime) $rowData['start_time'] = $lastStartTime;
                 if ($lastEndTime) $rowData['end_time'] = $lastEndTime;
            }

            // Update carry forward state
            if (!empty($rowData['day'])) $lastDay = $rowData['day'];
            if (!empty($rowData['date'])) $lastDate = $rowData['date'];
            
            // Time range parsing handles RTL inversions (e.g., 11:00-10:00 -> start 10, end 11)
            $timeObj = null;
            if (!empty($rowData['time'])) {
                $timeObj = $this->dtService->normalizeTimeRange($rowData['time']);
                if ($timeObj['start_time']) $rowData['start_time'] = $timeObj['start_time'];
                if ($timeObj['end_time']) $rowData['end_time'] = $timeObj['end_time'];
            }

            if (!empty($rowData['start_time'])) $lastStartTime = $rowData['start_time'];
            if (!empty($rowData['end_time'])) $lastEndTime = $rowData['end_time'];

            $validation = $this->validateRow($rowData, $importData);

            $parsedRows[] = [
                'index' => $index,
                'rowData' => $rowData,
                'validation' => $validation,
                'row' => $row
            ];
        }

        // Pass 2: Internal Conflict Detection & Insert
        // Check for conflicts inside the same Excel file and against DB
        foreach ($parsedRows as &$pRow) {
            if ($pRow['validation']['status'] === 'valid' || $pRow['validation']['status'] === 'warning') {
                $internalConflict = $this->checkInternalConflict($pRow, $parsedRows);
                if ($internalConflict) {
                    $pRow['validation']['status'] = 'conflict';
                    $pRow['validation']['errors'][] = $internalConflict;
                } else {
                    // Check against DB if it passes internal file check!
                    $dbCheckData = [
                        'course_code'       => $pRow['rowData']['course_code'],
                        'course_name'       => $pRow['rowData']['course_name'],
                        'faculty'           => $importData['faculty'],
                        'academic_year'     => $importData['academic_year'] ?? null,
                        'semester'          => $importData['semester'] ?? null,
                        'exam_period'       => $importData['exam_period'] ?? null,
                        'exam_date'         => $pRow['validation']['normalized_date'] ?? null,
                        'day'               => $pRow['validation']['day'] ?? $pRow['rowData']['day'],
                        'start_time'        => $pRow['validation']['normalized_start'] ?? null,
                        'end_time'          => $pRow['validation']['normalized_end'] ?? null,
                        'duration_minutes'  => $pRow['validation']['duration'] ?? null,
                        'student_count'     => $pRow['rowData']['student_count'],
                        'rooms'             => $pRow['rowData']['rooms'] ?? [],
                        'selected_sections' => $pRow['rowData']['section_numbers'] ?? [],
                        'is_full_day'       => false,
                    ];
                    
                    // 1. Check duplicates
                    $dupCheck = $this->duplicateService->findDuplicateCourseBooking($dbCheckData);
                    if (!$dupCheck['success']) {
                        $pRow['validation']['status'] = 'conflict';
                        $pRow['validation']['errors'][] = 'يوجد حجز مسبق لهذه المادة/الشعب في النظام';
                    } else {
                        // 2. Check room conflicts against scheduled exams
                        $sysConflicts = $this->conflictService->getAllConflicts($dbCheckData);
                        if (!empty($sysConflicts)) {
                            $pRow['validation']['status'] = 'conflict';
                            foreach ($sysConflicts as $sc) {
                                $pRow['validation']['errors'][] = 'تعارض مع النظام: ' . $sc['message'];
                            }
                        }
                    }
                }
            }

            $validation = $pRow['validation'];
            $rowData = $pRow['rowData'];
            $row = $pRow['row'];
            $index = $pRow['index'];

            DB::table('exam_schedule_import_rows')->insert([
                'import_id'        => $importId,
                'row_number'       => $index + 2,
                'faculty'          => $importData['faculty'],
                'academic_year'    => $importData['academic_year'] ?? null,
                'semester'         => $importData['semester'] ?? null,
                'exam_period'      => $importData['exam_period'] ?? null,
                'course_code'      => $rowData['course_code'],
                'course_name'      => $rowData['course_name'],
                'section_numbers'  => json_encode($rowData['section_numbers']),
                'instructors'      => json_encode($rowData['instructors']),
                'student_count'    => $rowData['student_count'],
                'capacity'         => $rowData['capacity'],
                'rooms'            => json_encode($rowData['rooms']),
                'exam_date'        => $validation['normalized_date'] ?? null,
                'day'              => $validation['day'] ?? $rowData['day'],
                'start_time'       => $validation['normalized_start'] ?? null,
                'end_time'         => $validation['normalized_end'] ?? null,
                'duration_minutes' => $validation['duration'] ?? null,
                'status'           => $validation['status'],
                'errors'           => json_encode($validation['errors']),
                'warnings'         => json_encode($validation['warnings'] ?? []),
                'raw_data'         => json_encode($row),
                'created_at'       => now(),
                'updated_at'       => now(),
            ]);

            if ($validation['status'] === 'valid') $validCount++;
            elseif ($validation['status'] === 'warning') $warningCount++;
            elseif ($validation['status'] === 'conflict') $conflictCount++;
            else $invalidCount++;
        }

        DB::table('exam_schedule_imports')->where('id', $importId)->update([
            'total_rows'    => $totalCount,
            'valid_rows'    => $validCount,
            'warning_rows'  => $warningCount,
            'conflict_rows' => $conflictCount,
            'invalid_rows'  => $invalidCount,
        ]);

        return [
            'success' => true, 
            'import_id' => $importId, 
            'total' => $totalCount, 
            'valid' => $validCount, 
            'warning' => $warningCount,
            'conflict' => $conflictCount,
            'invalid' => $invalidCount
        ];
    }

    public function confirmImport($importId, array $options)
    {
        $import = DB::table('exam_schedule_imports')->find($importId);
        if (!$import) {
            return ['success' => false, 'message' => 'عملية الاستيراد غير موجودة'];
        }

        $mode = $options['mode'] ?? 'import_new';
        $operatorName = $options['operator_name'] ?? 'Exam Coordinator';
        $operatorRole = $options['operator_role'] ?? 'admin';

        $rowsToProcess = DB::table('exam_schedule_import_rows')
            ->where('import_id', $importId)
            ->whereIn('status', ['valid', 'warning', 'conflict'])
            ->get();

        $importedCount = 0;

        DB::beginTransaction();
        try {
            foreach ($rowsToProcess as $row) {
                $data = [
                    'course_code'       => $row->course_code,
                    'course_name'       => $row->course_name,
                    'faculty'           => $import->faculty,
                    'academic_year'     => $import->academic_year,
                    'semester'          => $import->semester,
                    'exam_period'       => $import->exam_period,
                    'exam_date'         => $row->exam_date,
                    'day'               => $row->day,
                    'start_time'        => $row->start_time,
                    'end_time'          => $row->end_time,
                    'duration_minutes'  => $row->duration_minutes,
                    'student_count'     => $row->student_count,
                    'rooms'             => json_decode($row->rooms, true) ?? [],
                    'lecturer'          => (json_decode($row->instructors, true) ?? [])[0] ?? null,
                    'selected_sections' => json_decode($row->section_numbers, true) ?? [],
                    'is_full_day'       => false,
                ];

                // If already marked as conflict internally in pass 1, or needs duplicate check
                $conflicts = [];
                if ($row->status === 'conflict') {
                    $rowErrors = json_decode($row->errors, true) ?? [];
                    $hasInternal = false;
                    foreach ($rowErrors as $err) {
                        // The string 'في نفس الملف' is used by checkInternalConflict
                        if (str_contains($err, 'في نفس الملف')) {
                            $hasInternal = true; break;
                        }
                    }
                    if ($hasInternal) {
                        $conflicts[] = ['type' => 'internal_file_conflict', 'message' => 'تعارض داخل ملف الاستيراد نفسه'];
                    }
                }

                // Check Duplicates
                $dupCheck = $this->duplicateService->findDuplicateCourseBooking($data);
                if (!$dupCheck['success']) {
                    if ($mode === 'replace_existing' && !empty($dupCheck['duplicate']['existing_exam_ids'])) {
                        $this->duplicateService->replaceExistingExams(
                            $dupCheck['duplicate']['existing_exam_ids'],
                            "تم الاستبدال عبر استيراد جدول كلية: {$import->faculty}",
                            $operatorName,
                            $operatorRole
                        );
                    } else {
                        $conflicts[] = ['type' => 'duplicate_course_exam', 'message' => 'يوجد حجز مسبق لهذه المادة/الشعب'];
                    }
                }

                // Check Standard Conflicts against existing scheduled exams
                if (empty($conflicts) || $row->status !== 'conflict') {
                    $sysConflicts = $this->conflictService->getAllConflicts($data);
                    if (!empty($sysConflicts)) {
                        foreach ($sysConflicts as $sc) {
                            $conflicts[] = ['type' => 'system_conflict', 'message' => $sc['message']];
                        }
                    }
                }

                if (!empty($conflicts)) {
                    // It is a conflict. Create a conflict group and item.
                    $title = "تعارض استيراد: {$row->course_code}";
                    
                    // Create or find a group
                    // For simplicity, create a new group per conflict row. Later we can group by date/room.
                    $groupId = DB::table('exam_conflict_groups')->insertGetId([
                        'conflict_type' => $conflicts[0]['type'],
                        'title'         => $title,
                        'description'   => collect($conflicts)->pluck('message')->implode(' | '),
                        'status'        => 'open',
                        'created_at'    => now(),
                        'updated_at'    => now()
                    ]);

                    DB::table('exam_conflict_items')->insert([
                        'conflict_group_id' => $groupId,
                        'import_row_id'     => $row->id,
                        'course_code'       => $row->course_code,
                        'course_name'       => $row->course_name,
                        'section_number'    => implode(',', $data['selected_sections']),
                        'instructor_name'   => current($data['selected_sections']) ? $data['lecturer'] : null,
                        'room_names'        => json_encode($data['rooms']),
                        'exam_date'         => $data['exam_date'],
                        'start_time'        => $data['start_time'],
                        'end_time'          => $data['end_time'],
                        'student_count'     => $data['student_count'],
                        'action_status'     => 'pending_review',
                        'created_at'        => now(),
                        'updated_at'        => now()
                    ]);

                    DB::table('exam_schedule_import_rows')->where('id', $row->id)->update([
                        'status' => 'conflict',
                        'conflict_group_id' => $groupId,
                        'errors' => json_encode(array_column($conflicts, 'message'))
                    ]);
                    
                    continue;
                }

                // If valid or just warning (holiday but no conflict), insert the exam
                // Compute capacity from DB rooms — never trust the spreadsheet value
                $roomsForCap  = array_unique($data['rooms'] ?? []);
                $totalCapacity = DB::table('rooms')->whereIn('room_name', $roomsForCap)->sum('capacity');

                // Take only the FIRST instructor as the primary lecturer
                $primaryLecturer = !empty($data['lecturer'])
                    ? trim(explode(',', $data['lecturer'])[0])
                    : null;

                $examId = DB::table('scheduled_exams')->insertGetId([
                    'faculty'          => $data['faculty'],
                    'day'              => $data['day'],
                    'exam_date'        => $data['exam_date'],
                    'start_time'       => $data['start_time'],
                    'end_time'         => $data['end_time'],
                    'duration_minutes' => $data['duration_minutes'],
                    'lecturer'         => $primaryLecturer,
                    'rooms_json'       => json_encode($data['rooms']),
                    'total_capacity'   => $totalCapacity,
                    'student_count'    => $data['student_count'] ?? 0,
                    'course_code'      => $data['course_code'],
                    'course_name'      => $data['course_name'],
                    'status'           => 'scheduled',
                    'academic_year'    => $data['academic_year'],
                    'semester'         => $data['semester'],
                    'exam_period'      => $data['exam_period'],
                    'source_type'      => 'import',
                    'import_id'        => $importId,
                    'import_row_id'    => $row->id,
                    'created_at'       => now(),
                    'updated_at'       => now(),
                ]);

                // Insert sections
                foreach ($data['selected_sections'] as $sec) {
                    DB::table('scheduled_exam_sections')->insert([
                        'scheduled_exam_id' => $examId,
                        'course_code'       => $data['course_code'],
                        'course_name'       => $data['course_name'],
                        'section_key'       => $sec,
                        'section_number'    => $sec,
                        'instructor_name'   => $data['lecturer'],
                        'created_at'        => now(),
                    ]);
                }

                // Insert rooms (Ensure no duplicates in input)
                $uniqueRooms = array_unique($data['rooms'] ?? []);
                foreach ($uniqueRooms as $room) {
                    $roomObj = DB::table('rooms')->where('room_name', $room)->first();
                    DB::table('scheduled_exam_rooms')->insert([
                        'scheduled_exam_id' => $examId,
                        'room_id'           => $roomObj ? $roomObj->id : null,
                        'room_name'         => $room,
                        'created_at'        => now(),
                        'updated_at'        => now(),
                    ]);
                }

                DB::table('exam_schedule_import_rows')->where('id', $row->id)->update(['status' => 'imported']);
                $importedCount++;
            }

            DB::table('exam_schedule_imports')->where('id', $importId)->update([
                'status' => 'imported',
                'imported_rows' => $importedCount,
                'updated_at' => now(),
            ]);

            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error("Import confirm failed: " . $e->getMessage());
            return ['success' => false, 'message' => 'حدث خطأ أثناء حفظ البيانات المعتمدة: ' . $e->getMessage()];
        }

        app(AuditLogService::class)->log(
            action: 'exam_schedule_imported',
            entityType: 'exam_schedule_import',
            entityId: $importId,
            newValues: ['imported_count' => $importedCount, 'faculty' => $import->faculty],
            ipAddress: request()->ip(),
            operatorName: $operatorName,
            operatorRole: $operatorRole
        );

        return ['success' => true, 'imported' => $importedCount];
    }

    private function mapHeaders(array $headers): array
    {
        $map = [];
        foreach ($headers as $index => $header) {
            $header = mb_strtolower(trim($header));
            if (in_array($header, ['course_code', 'كود المادة', 'رمز المقرر', 'رقم المادة', 'رمز المادة', 'رقم المقرر', 'subject_code'])) $map['course_code'] = $index;
            elseif (in_array($header, ['course name', 'course_name', 'اسم المادة', 'اسم المقرر', 'subject_name'])) $map['course_name'] = $index;
            elseif (in_array($header, ['section', 'sections', 'الشعبة', 'الشعب', 'ش'])) $map['sections'] = $index;
            elseif (in_array($header, ['instructor', 'instructors', 'المحاضر', 'المدرس', 'مدرس المادة', 'lecturer', 'اسم المحاضر'])) $map['instructors'] = $index;
            elseif (in_array($header, ['date', 'التاريخ', 'تاريخ'])) $map['date'] = $index;
            elseif (in_array($header, ['day', 'اليوم', 'يوم'])) $map['day'] = $index;
            elseif (in_array($header, ['time', 'الوقت', 'وقت'])) $map['time'] = $index;
            elseif (in_array($header, ['start_time', 'start', 'from', 'من', 'الوقت من', 'وقت البداية'])) $map['start_time'] = $index;
            elseif (in_array($header, ['end_time', 'end', 'to', 'إلى', 'الوقت إلى', 'وقت النهاية'])) $map['end_time'] = $index;
            elseif (in_array($header, ['duration', 'المدة'])) $map['duration'] = $index;
            elseif (in_array($header, ['room', 'rooms', 'القاعة', 'القاعات', 'المختبر', 'المختبرات', 'lab'])) $map['rooms'] = $index;
            elseif (in_array($header, ['capacity', 'السعة'])) $map['capacity'] = $index;
            elseif (in_array($header, ['students', 'student_count', 'الطلبة', 'عدد الطلاب', 'عدد الطلبة المتقدمين', 'عدد الطلبة'])) $map['student_count'] = $index;
            elseif (in_array($header, ['notes', 'ملاحظات'])) $map['notes'] = $index;
        }
        return $map;
    }

    private function extractRowData(array $row, array $map): array
    {
        $extract = function($key) use ($row, $map) {
            return isset($map[$key], $row[$map[$key]]) ? trim($row[$map[$key]]) : null;
        };

        $sectionsStr = $extract('sections');
        $roomsStr = $extract('rooms');
        $instructorsStr = $extract('instructors');

        // Parse rooms correctly on hyphens without ranges
        $rooms = [];
        if ($roomsStr) {
            $rooms = array_map('trim', explode(',', str_replace('،', ',', $roomsStr)));
            $finalRooms = [];
            foreach ($rooms as $r) {
                // Split on hyphen since they usually mean multiple rooms e.g., 4121-4210
                $hyphenSplit = array_map('trim', explode('-', $r));
                $finalRooms = array_merge($finalRooms, $hyphenSplit);
            }
            $rooms = array_values(array_filter($finalRooms));
        }

        return [
            'course_code'   => $extract('course_code'),
            'course_name'   => $extract('course_name'),
            'section_numbers'=> $sectionsStr ? array_map('trim', explode(',', str_replace(['،', '-'], ',', $sectionsStr))) : [],
            'rooms'         => $rooms,
            'instructors'   => $instructorsStr ? array_map('trim', explode(',', str_replace('،', ',', $instructorsStr))) : [],
            'date'          => $extract('date'),
            'day'           => $extract('day'),
            'time'          => $extract('time'),
            'start_time'    => $extract('start_time'),
            'end_time'      => $extract('end_time'),
            'duration'      => $extract('duration'),
            'student_count' => (int)$extract('student_count'),
            'capacity'      => (int)$extract('capacity'),
            'notes'         => $extract('notes'),
        ];
    }

    private function validateRow(array $data, array $importData): array
    {
        $errors = [];
        $warnings = [];
        $status = 'valid';

        // Check for holiday keywords
        $holidayKeywords = ['عيد الفصح', 'عطلة', 'إجازة', 'holiday'];
        $isHoliday = false;
        foreach (array_merge([$data['course_code'], $data['course_name'], $data['notes']], $data['rooms']) as $val) {
            if (empty($val)) continue;
            foreach ($holidayKeywords as $kw) {
                if (mb_stripos($val, $kw) !== false) {
                    $isHoliday = true;
                    break 2;
                }
            }
        }

        if ($isHoliday) {
            $warnings[] = "هذا الصف يبدو عطلة وليس امتحانًا";
            $status = 'warning';
        }

        if (empty($data['course_code'])) $errors[] = "كود المادة مفقود";
        if (empty($data['section_numbers']) && !$isHoliday) $warnings[] = "الشعب مفقودة";
        if (empty($data['rooms']) && !$isHoliday) $errors[] = "القاعات مفقودة";

        // Date normalization
        $normDate = $this->dtService->normalizeDate($data['date']);
        if (!$normDate && !$isHoliday) {
            $errors[] = "تاريخ غير صالح: {$data['date']}";
        }

        $normStart = $this->dtService->normalizeTime($data['start_time']);
        $normEnd = $this->dtService->normalizeTime($data['end_time']);

        if ((!$normStart || !$normEnd) && !$isHoliday) {
            $errors[] = "وقت غير صالح";
        }

        $dayResolve = $this->dtService->resolveDayAndDate($data['day'], $normDate);
        $day = $dayResolve['day'] ?? null;
        if ($dayResolve['warning']) $warnings[] = $dayResolve['warning'];
        if (!$day && !$isHoliday) $errors[] = "اليوم غير صالح أو مفقود";

        $duration = 60;
        if ($normStart && $normEnd) {
            $s = Carbon::parse($normStart);
            $e = Carbon::parse($normEnd);
            $duration = $e->diffInMinutes($s);
        }

        if (!empty($errors)) $status = 'invalid';

        return [
            'status'           => $status,
            'errors'           => $errors,
            'warnings'         => $warnings,
            'normalized_date'  => $normDate,
            'normalized_start' => $normStart,
            'normalized_end'   => $normEnd,
            'duration'         => $duration,
            'day'              => $day,
        ];
    }

    private function checkInternalConflict(array $currentRow, array $allRows): ?string
    {
        $cRow = $currentRow['rowData'];
        $cVal = $currentRow['validation'];
        
        if (!$cVal['normalized_date'] || !$cVal['normalized_start'] || !$cVal['normalized_end']) return null;
        
        $cStart = Carbon::parse($cVal['normalized_start']);
        $cEnd = Carbon::parse($cVal['normalized_end']);
        
        foreach ($allRows as $pRow) {
            if ($pRow['index'] === $currentRow['index']) continue; // skip self
            
            $pVal = $pRow['validation'];
            $pRowD = $pRow['rowData'];

            if ($pVal['status'] === 'invalid') continue;
            
            if ($cVal['normalized_date'] === $pVal['normalized_date']) {
                if (!$pVal['normalized_start'] || !$pVal['normalized_end']) continue;
                
                $pStart = Carbon::parse($pVal['normalized_start']);
                $pEnd = Carbon::parse($pVal['normalized_end']);
                
                // Overlap
                if ($cStart < $pEnd && $cEnd > $pStart) {
                    $sharedRooms = array_intersect($cRow['rooms'], $pRowD['rooms']);
                    if (!empty($sharedRooms)) {
                        return "تعارض مع صف آخر في نفس الملف في القاعة: " . implode(',', $sharedRooms);
                    }
                }
            }
        }
        return null;
    }
}
