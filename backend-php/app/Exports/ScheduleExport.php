<?php

namespace App\Exports;

use Illuminate\Support\Facades\DB;
use Maatwebsite\Excel\Concerns\FromCollection;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;

class ScheduleExport implements FromCollection, WithHeadings, WithMapping, ShouldAutoSize
{
    protected $params;

    public function __construct(array $params)
    {
        $this->params = $params;
    }

    public function collection()
    {
        $query = DB::table('scheduled_exams')
            ->select('scheduled_exams.*', DB::raw('(SELECT GROUP_CONCAT(room_name SEPARATOR ", ") FROM scheduled_exam_rooms WHERE scheduled_exam_id = scheduled_exams.id) as assigned_rooms'))
            ->where('status', '!=', 'cancelled')
            ->orderByRaw("FIELD(LOWER(day), 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday')")
            ->orderBy('start_time');

        if (!empty($this->params['faculty'])) {
            $query->where('faculty', $this->params['faculty']);
        }

        if (!empty($this->params['day'])) {
            $query->where('day', $this->params['day']);
        }

        return $query->get();
    }

    public function headings(): array
    {
        return [
            'المبنى/الكلية',
            'اليوم',
            'التاريخ',
            'من',
            'إلى',
            'رمز المادة',
            'اسم المادة',
            'الشعبة',
            'المحاضر',
            'القاعات',
            'عدد الطلاب',
        ];
    }

    public function map($exam): array
    {
        return [
            $exam->faculty ?? 'غير محدد',
            $exam->day,
            $exam->exam_date ?? '-',
            $exam->start_time,
            $exam->end_time,
            $exam->course_code,
            $exam->course_name ?? '-',
            $exam->section ?? '-',
            $exam->lecturer ?? '-',
            $exam->assigned_rooms ?? '-',
            $exam->student_count ?? '-',
        ];
    }
}
