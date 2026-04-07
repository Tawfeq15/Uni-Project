const express = require('express');
const router = express.Router();
const db = require('../db');
const { suggestExamSlots } = require('../services/availability');

// POST /exams/requests – create new exam request
router.post('/requests', (req, res) => {
  try {
    const {
      course_code, course_name, section, lecturer, student_count,
      faculty, preferred_day, preferred_date, duration_minutes,
      room_type_preference, notes,
    } = req.body;

    if (!faculty) return res.status(400).json({ error: 'يجب تحديد الكلية' });

    const result = db.prepare(`
      INSERT INTO exam_requests (
        course_code, course_name, section, lecturer, student_count,
        faculty, preferred_day, preferred_date, duration_minutes,
        room_type_preference, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      course_code, course_name, section, lecturer, student_count || 0,
      faculty, preferred_day, preferred_date, duration_minutes || 60,
      room_type_preference || 'room', notes,
    );

    const exam = db.prepare('SELECT * FROM exam_requests WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, exam });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /exams/requests – list all exam requests
router.get('/requests', (req, res) => {
  try {
    const { faculty, status } = req.query;
    let where = [];
    const params = [];

    if (faculty) { where.push('LOWER(faculty) = LOWER(?)'); params.push(faculty); }
    if (status) { where.push('status = ?'); params.push(status); }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const exams = db.prepare(`SELECT * FROM exam_requests ${whereStr} ORDER BY created_at DESC`).all(...params);
    res.json({ exams });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /exams/requests/:id
router.get('/requests/:id', (req, res) => {
  try {
    const exam = db.prepare('SELECT * FROM exam_requests WHERE id = ?').get(req.params.id);
    if (!exam) return res.status(404).json({ error: 'الطلب غير موجود' });
    res.json(exam);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /exams/requests/:id
router.delete('/requests/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM exam_requests WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /exams/suggest-slot – get suggestions for an exam
router.post('/suggest-slot', (req, res) => {
  try {
    const {
      faculty, day, duration, studentCount, lecturer, roomType,
    } = req.body;

    const result = suggestExamSlots({
      faculty,
      day,
      duration: duration ? parseInt(duration) : null,
      studentCount: studentCount ? parseInt(studentCount) : 0,
      lecturer,
      roomType: roomType || 'room',
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /exams/schedule – save a scheduled exam
router.post('/schedule', (req, res) => {
  try {
    const {
      exam_request_id, faculty, day, exam_date, start_time, end_time,
      duration_minutes, lecturer, rooms, total_capacity, student_count,
      course_code, course_name, section,
    } = req.body;

    if (!day || !start_time || !end_time || !rooms || !rooms.length) {
      return res.status(400).json({ error: 'بيانات غير مكتملة' });
    }

    const result = db.prepare(`
      INSERT INTO scheduled_exams (
        exam_request_id, faculty, day, exam_date, start_time, end_time,
        duration_minutes, lecturer, rooms_json, total_capacity, student_count,
        course_code, course_name, section, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
    `).run(
      exam_request_id || null, faculty, day, exam_date || null,
      start_time, end_time, duration_minutes || 60,
      lecturer, JSON.stringify(rooms), total_capacity || 0, student_count || 0,
      course_code, course_name, section,
    );

    // Update exam request status if linked
    if (exam_request_id) {
      db.prepare(`UPDATE exam_requests SET status = 'scheduled' WHERE id = ?`).run(exam_request_id);
    }

    const exam = db.prepare('SELECT * FROM scheduled_exams WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, exam });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /exams/scheduled – list all scheduled exams
router.get('/scheduled', (req, res) => {
  try {
    const { faculty, day } = req.query;
    let where = ['status != \'cancelled\''];
    const params = [];

    if (faculty) { where.push('LOWER(faculty) = LOWER(?)'); params.push(faculty); }
    if (day) { where.push('LOWER(day) = LOWER(?)'); params.push(day); }

    const whereStr = 'WHERE ' + where.join(' AND ');
    const exams = db.prepare(`SELECT * FROM scheduled_exams ${whereStr} ORDER BY day, start_time`).all(...params);

    // Parse rooms_json for frontend
    const result = exams.map(e => ({
      ...e,
      rooms: (() => { try { return JSON.parse(e.rooms_json || '[]'); } catch { return []; } })(),
    }));

    res.json({ exams: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /exams/scheduled/:id
router.delete('/scheduled/:id', (req, res) => {
  try {
    const exam = db.prepare('SELECT * FROM scheduled_exams WHERE id = ?').get(req.params.id);
    if (!exam) return res.status(404).json({ error: 'الاختبار غير موجود' });

    if (exam.exam_request_id) {
      db.prepare(`UPDATE exam_requests SET status = 'pending' WHERE id = ?`).run(exam.exam_request_id);
    }

    db.prepare('DELETE FROM scheduled_exams WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
