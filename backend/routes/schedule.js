const express = require('express');
const router = express.Router();
const db = require('../db');
const XLSX = require('xlsx');

function getScheduledExams(faculty, day) {
  let where = [`se.status != 'cancelled'`];
  const params = [];
  if (faculty) { where.push('LOWER(se.faculty) = LOWER(?)'); params.push(faculty); }
  if (day) { where.push('LOWER(se.day) = LOWER(?)'); params.push(day); }
  const whereStr = 'WHERE ' + where.join(' AND ');

  const exams = db.prepare(`
    SELECT se.*
    FROM scheduled_exams se
    ${whereStr}
    ORDER BY se.day, se.start_time
  `).all(...params);

  return exams.map(e => ({
    ...e,
    rooms: (() => { try { return JSON.parse(e.rooms_json || '[]'); } catch { return []; } })(),
  }));
}

// GET /schedule
router.get('/', (req, res) => {
  try {
    const { faculty, day } = req.query;
    const exams = getScheduledExams(faculty, day);
    res.json({ exams });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /schedule/export/excel
router.get('/export/excel', (req, res) => {
  try {
    const { faculty, day } = req.query;
    const exams = getScheduledExams(faculty, day);

    const dayLabels = {
      sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء',
      wednesday: 'الأربعاء', thursday: 'الخميس', friday: 'الجمعة', saturday: 'السبت',
    };

    const rows = exams.map((e, i) => ({
      '#': i + 1,
      'اليوم': dayLabels[e.day] || e.day,
      'التاريخ': e.exam_date || '-',
      'من': e.start_time,
      'إلى': e.end_time,
      'المدة (دقيقة)': e.duration_minutes,
      'الكلية': e.faculty,
      'كود المادة': e.course_code || '-',
      'اسم المادة': e.course_name || '-',
      'الشعبة': e.section || '-',
      'المحاضر': e.lecturer || '-',
      'القاعات': e.rooms.join(' / '),
      'سعة القاعات': e.total_capacity,
      'عدد الطلاب': e.student_count,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'جدول الاختبارات');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="exam_schedule.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
