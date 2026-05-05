<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>جدول الاختبارات</title>
    <style>
        body { font-family: 'XBRiyaz', sans-serif; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 6px; text-align: right; }
        th { background-color: #f4f4f4; }
        h2 { text-align: center; }
    </style>
</head>
<body>
    <h2>جدول الاختبارات المحوسبة</h2>
    <table>
        <thead>
            <tr>
                <th>اليوم</th>
                <th>التاريخ</th>
                <th>الوقت</th>
                <th>رمز المادة</th>
                <th>اسم المادة</th>
                <th>الشعبة</th>
                <th>المحاضر</th>
                <th>القاعات</th>
                <th>الطلاب</th>
            </tr>
        </thead>
        <tbody>
            @foreach($exams as $exam)
            <tr>
                <td>{{ $dayLabels[$exam->day] ?? $exam->day }}</td>
                <td>{{ $exam->exam_date ?? '-' }}</td>
                <td dir="ltr">{{ $exam->start_time }} - {{ $exam->end_time }}</td>
                <td>{{ $exam->course_code }}</td>
                <td>{{ $exam->course_name ?? '-' }}</td>
                <td>{{ $exam->section ?? '-' }}</td>
                <td>{{ $exam->lecturer ?? '-' }}</td>
                <td>{{ is_array($exam->rooms) ? implode(' / ', $exam->rooms) : '-' }}</td>
                <td>{{ $exam->student_count }}</td>
            </tr>
            @endforeach
        </tbody>
    </table>
</body>
</html>
