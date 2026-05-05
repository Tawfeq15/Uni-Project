<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Barryvdh\DomPDF\Facade\Pdf;

class ScheduleController extends Controller
{
    private array $dayLabels = [
        'sunday'    => 'الأحد',
        'monday'    => 'الاثنين',
        'tuesday'   => 'الثلاثاء',
        'wednesday' => 'الأربعاء',
        'thursday'  => 'الخميس',
        'friday'    => 'الجمعة',
        'saturday'  => 'السبت',
    ];

    private function getScheduledExams(Request $request): array
    {
        $query = DB::table('scheduled_exams as se');
        
        $includeCancelled = $request->boolean('include_cancelled', false);
        $includeReplaced = $request->boolean('include_replaced', false);
        
        $statuses = ['scheduled'];
        if ($includeCancelled) $statuses[] = 'cancelled';
        if ($includeReplaced) $statuses[] = 'replaced';
        $query->whereIn('se.status', $statuses);

        if ($request->query('faculty'))     $query->whereRaw('LOWER(se.faculty) = LOWER(?)', [$request->query('faculty')]);
        if ($request->query('day'))         $query->whereRaw('LOWER(se.day) = LOWER(?)',     [$request->query('day')]);
        if ($request->query('date_from'))   $query->where('se.exam_date', '>=', $request->query('date_from'));
        if ($request->query('date_to'))     $query->where('se.exam_date', '<=', $request->query('date_to'));
        if ($request->query('course_code')) $query->where('se.course_code', 'LIKE', '%' . $request->query('course_code') . '%');
        if ($request->query('course_name')) $query->where('se.course_name', 'LIKE', '%' . $request->query('course_name') . '%');
        if ($request->query('room'))        $query->whereJsonContains('se.rooms_json', $request->query('room'));
        if ($request->query('lecturer'))    $query->where('se.lecturer', 'LIKE', '%' . $request->query('lecturer') . '%');
        if ($request->query('instructor'))  $query->where('se.lecturer', 'LIKE', '%' . $request->query('instructor') . '%');
        if ($request->query('exam_period')) $query->where('se.exam_period', $request->query('exam_period'));
        if ($request->query('source_type')) $query->where('se.source_type', $request->query('source_type'));

        $exams = $query->orderBy('se.exam_date')
                       ->orderBy('se.start_time')
                       ->orderBy('se.course_code')
                       ->get();

        return $exams->map(function ($e) {
            $e->rooms = json_decode($e->rooms_json ?? '[]', true) ?? [];
            return $e;
        })->toArray();
    }

    /** GET /api/schedule */
    public function index(Request $request)
    {
        $exams = $this->getScheduledExams($request);
        return response()->json(['exams' => $exams]);
    }

    /** DELETE /api/schedule */
    public function clear()
    {
        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();
        DB::table('scheduled_exam_sections')->truncate();
        DB::table('scheduled_exams')->truncate();
        DB::table('exam_conflict_items')->truncate();
        DB::table('exam_conflict_groups')->truncate();
        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
        
        return response()->json(['success' => true, 'message' => 'تم إفراغ الجدول وحذف التعارضات بالكامل']);
    }

    /** GET /api/schedule/export/excel */
    public function exportExcel(Request $request)
    {
        $exams = $this->getScheduledExams($request);

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('جدول الاختبارات');
        $sheet->setRightToLeft(true);

        // Set column widths
        $sheet->getColumnDimension('A')->setWidth(12);
        $sheet->getColumnDimension('B')->setWidth(15);
        $sheet->getColumnDimension('C')->setWidth(20);
        $sheet->getColumnDimension('D')->setWidth(15);
        $sheet->getColumnDimension('E')->setWidth(8);
        $sheet->getColumnDimension('F')->setWidth(45);
        $sheet->getColumnDimension('G')->setWidth(25);
        $sheet->getColumnDimension('H')->setWidth(35);
        $sheet->getColumnDimension('I')->setWidth(15);
        $sheet->getColumnDimension('J')->setWidth(15);

        // Header
        $headers = ['اليوم', 'التاريخ', 'الوقت', 'رقم المادة', 'ش', 'اسم المادة', 'اسم المحاضر', 'القاعة', 'السعة', 'عدد الطلبة'];
        $sheet->fromArray($headers, null, 'A1');
        
        $sheet->getStyle('A1:J1')->applyFromArray([
            'fill' => ['fillType' => 'solid', 'startColor' => ['argb' => 'FFD9D9D9']],
            'font' => ['bold' => true],
            'alignment' => ['horizontal' => 'center', 'vertical' => 'center']
        ]);

        // Group exams by date
        $groupedExams = [];
        foreach ($exams as $exam) {
            $date = $exam->exam_date ?? 'other';
            if (!isset($groupedExams[$date])) $groupedExams[$date] = [];
            $groupedExams[$date][] = $exam;
        }

        // Sort groups chronologically
        uksort($groupedExams, function($a, $b) {
            $isDateA = str_contains($a, '-');
            $isDateB = str_contains($b, '-');
            if ($isDateA && $isDateB) return strtotime($a) - strtotime($b);
            if ($isDateA) return -1;
            if ($isDateB) return 1;
            return 0;
        });

        $rowNum = 2;
        $groupIndex = 0;

        foreach ($groupedExams as $date => $dayExams) {
            $isBlue = $groupIndex % 2 !== 0;

            foreach ($dayExams as $idx => $exam) {
                // Holiday / Full Day
                if ($exam->is_full_day) {
                    $sheet->mergeCells("A{$rowNum}:J{$rowNum}");
                    $sheet->setCellValue("A{$rowNum}", $exam->course_name ?? 'عطلة / مناسبة');
                    $sheet->getStyle("A{$rowNum}:J{$rowNum}")->applyFromArray([
                        'fill' => ['fillType' => 'solid', 'startColor' => ['argb' => 'FFFF0000']],
                        'font' => ['bold' => true, 'color' => ['argb' => 'FFFFFFFF']],
                        'alignment' => ['horizontal' => 'center', 'vertical' => 'center']
                    ]);
                    $rowNum++;
                    continue;
                }

                $dayLabel = $idx === 0 ? ($this->dayLabels[$exam->day] ?? $exam->day) : '';
                $dateLabel = $idx === 0 ? ($exam->exam_date ? date('d/m/Y', strtotime($exam->exam_date)) : '') : '';
                
                $timeLabel = ($exam->end_time && $exam->start_time) ? 
                    date('H:i', strtotime($exam->end_time)) . '-' . date('H:i', strtotime($exam->start_time)) : 
                    ($exam->start_time ?? '');

                $rooms = is_array($exam->rooms) ? implode('-', $exam->rooms) : '';

                $sheet->setCellValue("A{$rowNum}", $dayLabel);
                $sheet->setCellValue("B{$rowNum}", $dateLabel);
                $sheet->setCellValue("C{$rowNum}", $timeLabel);
                $sheet->setCellValue("D{$rowNum}", $exam->course_code);
                $sheet->setCellValue("E{$rowNum}", $exam->section);
                $sheet->setCellValue("F{$rowNum}", $exam->course_name);
                $sheet->setCellValue("G{$rowNum}", $exam->lecturer);
                $sheet->setCellValue("H{$rowNum}", $rooms);
                $sheet->setCellValue("I{$rowNum}", $exam->total_capacity);
                $sheet->setCellValue("J{$rowNum}", $exam->student_count);

                if ($isBlue) {
                    $sheet->getStyle("A{$rowNum}:J{$rowNum}")->applyFromArray([
                        'fill' => ['fillType' => 'solid', 'startColor' => ['argb' => 'FFDEEAF6']] // Excel standard light blue
                    ]);
                }

                $sheet->getStyle("A{$rowNum}:J{$rowNum}")->getAlignment()
                    ->setHorizontal('center')->setVertical('center');
                
                $rowNum++;
            }
            $groupIndex++;
        }

        // Apply borders
        if ($rowNum > 2) {
            $sheet->getStyle("A1:J" . ($rowNum - 1))->applyFromArray([
                'borders' => [
                    'allBorders' => [
                        'borderStyle' => \PhpOffice\PhpSpreadsheet\Style\Border::BORDER_THIN,
                        'color' => ['argb' => 'FF000000'],
                    ],
                ],
            ]);
        }

        $writer = new Xlsx($spreadsheet);
        $tmpPath = tempnam(sys_get_temp_dir(), 'exam_schedule_') . '.xlsx';
        $writer->save($tmpPath);

        return response()->download($tmpPath, 'exam_schedule.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])->deleteFileAfterSend(true);
    }

    /** GET /api/schedule/export/pdf */
    public function exportPdf(Request $request)
    {
        $exams = $this->getScheduledExams($request);

        $pdf = Pdf::loadView('pdf.schedule', [
            'exams' => json_decode(json_encode($exams)), // Ensure we can access as objects
            'dayLabels' => $this->dayLabels
        ]);

        return $pdf->download('exam_schedule.pdf');
    }
}
