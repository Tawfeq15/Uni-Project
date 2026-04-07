const express = require('express');
const router = express.Router();
const db = require('../db');
const { isRoomFree, isLecturerFree, toMinutes } = require('../services/occupancy');

// POST /conflicts/rebuild – detect all conflicts and store them
router.post('/rebuild', (req, res) => {
  try {
    db.prepare('DELETE FROM conflicts').run();

    const conflicts = [];

    // 1. Check scheduled exams for room conflicts
    const scheduledExams = db.prepare(`
      SELECT * FROM scheduled_exams WHERE status != 'cancelled'
    `).all();

    for (let i = 0; i < scheduledExams.length; i++) {
      const examA = scheduledExams[i];
      const roomsA = (() => { try { return JSON.parse(examA.rooms_json || '[]'); } catch { return []; } })();
      const startA = toMinutes(examA.start_time);
      const endA = toMinutes(examA.end_time);

      for (let j = i + 1; j < scheduledExams.length; j++) {
        const examB = scheduledExams[j];
        if (examA.day !== examB.day) continue;

        const roomsB = (() => { try { return JSON.parse(examB.rooms_json || '[]'); } catch { return []; } })();
        const startB = toMinutes(examB.start_time);
        const endB = toMinutes(examB.end_time);

        // Check time overlap
        const overlaps = startA < endB && endA > startB;
        if (!overlaps) continue;

        // Room conflict
        const sharedRooms = roomsA.filter(r => roomsB.includes(r));
        for (const room of sharedRooms) {
          conflicts.push({
            conflict_type: 'room_conflict',
            reference_type: 'scheduled_exam',
            reference_id: examA.id,
            faculty: examA.faculty,
            room,
            lecturer: null,
            day: examA.day,
            start_time: examA.start_time,
            end_time: examA.end_time,
            message: `تعارض في القاعة ${room} بين "${examA.course_code}" و "${examB.course_code}"`,
            severity: 'error',
          });
        }

        // Lecturer conflict
        if (examA.lecturer && examB.lecturer && examA.lecturer === examB.lecturer) {
          conflicts.push({
            conflict_type: 'lecturer_conflict',
            reference_type: 'scheduled_exam',
            reference_id: examA.id,
            faculty: examA.faculty,
            room: null,
            lecturer: examA.lecturer,
            day: examA.day,
            start_time: examA.start_time,
            end_time: examA.end_time,
            message: `تعارض في جدول المحاضر ${examA.lecturer} بين "${examA.course_code}" و "${examB.course_code}"`,
            severity: 'error',
          });
        }
      }

      // 2. Check if exam overlaps with lecture sessions
      for (const room of roomsA) {
        const sessions = db.prepare(`
          SELECT ps.*, uf.original_name as source_file
          FROM parsed_sessions ps
          JOIN uploaded_files uf ON ps.uploaded_file_id = uf.id
          WHERE LOWER(ps.room) = LOWER(?)
            AND LOWER(ps.day) = LOWER(?)
            AND ps.is_valid = 1
            AND uf.is_active = 1
            AND ps.start_time IS NOT NULL
        `).all(room, examA.day);

        for (const session of sessions) {
          const sesStart = toMinutes(session.start_time);
          const sesEnd = toMinutes(session.end_time);
          if (startA < sesEnd && endA > sesStart) {
            conflicts.push({
              conflict_type: 'lecture_overlap',
              reference_type: 'scheduled_exam',
              reference_id: examA.id,
              faculty: examA.faculty,
              room,
              lecturer: null,
              day: examA.day,
              start_time: examA.start_time,
              end_time: examA.end_time,
              message: `الاختبار "${examA.course_code}" يتعارض مع محاضرة "${session.course_name || ''}" في القاعة ${room}`,
              severity: 'error',
            });
          }
        }
      }
    }

    // 3. Capacity issues
    for (const exam of scheduledExams) {
      if (exam.student_count > 0 && exam.total_capacity < exam.student_count) {
        conflicts.push({
          conflict_type: 'capacity_issue',
          reference_type: 'scheduled_exam',
          reference_id: exam.id,
          faculty: exam.faculty,
          room: null,
          lecturer: null,
          day: exam.day,
          start_time: exam.start_time,
          end_time: exam.end_time,
          message: `سعة القاعة (${exam.total_capacity}) أقل من عدد الطلاب (${exam.student_count}) في "${exam.course_code}"`,
          severity: 'warning',
        });
      }
    }

    // 4. Unscheduled exam requests
    const unscheduled = db.prepare(`
      SELECT * FROM exam_requests WHERE status = 'pending'
    `).all();

    for (const req of unscheduled) {
      conflicts.push({
        conflict_type: 'unscheduled',
        reference_type: 'exam_request',
        reference_id: req.id,
        faculty: req.faculty,
        room: null,
        lecturer: null,
        day: null,
        start_time: null,
        end_time: null,
        message: `طلب الاختبار "${req.course_code} - ${req.section || ''}" لم يتم جدولته بعد`,
        severity: 'warning',
      });
    }

    // 5. Invalid parse rows
    const invalidSessions = db.prepare(`
      SELECT COUNT(*) as cnt FROM parsed_sessions WHERE is_valid = 0
    `).get();

    if (invalidSessions.cnt > 0) {
      conflicts.push({
        conflict_type: 'parse_error',
        reference_type: 'parsed_sessions',
        reference_id: null,
        faculty: null,
        room: null,
        lecturer: null,
        day: null,
        start_time: null,
        end_time: null,
        message: `يوجد ${invalidSessions.cnt} سجل غير صالح في جداول المحاضرات`,
        severity: 'warning',
      });
    }

    // Insert all conflicts
    const insertConflict = db.prepare(`
      INSERT INTO conflicts (conflict_type, reference_type, reference_id, faculty, room, lecturer, day, start_time, end_time, message, severity)
      VALUES (@conflict_type, @reference_type, @reference_id, @faculty, @room, @lecturer, @day, @start_time, @end_time, @message, @severity)
    `);

    db.transaction((items) => {
      for (const item of items) insertConflict.run(item);
    })(conflicts);

    res.json({ success: true, conflicts_count: conflicts.length, conflicts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /conflicts
router.get('/', (req, res) => {
  try {
    const { severity, type } = req.query;
    let where = [];
    const params = [];

    if (severity) { where.push('severity = ?'); params.push(severity); }
    if (type) { where.push('conflict_type = ?'); params.push(type); }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const conflicts = db.prepare(`SELECT * FROM conflicts ${whereStr} ORDER BY severity DESC, created_at DESC`).all(...params);

    const summary = {
      total: conflicts.length,
      errors: conflicts.filter(c => c.severity === 'error').length,
      warnings: conflicts.filter(c => c.severity === 'warning').length,
      by_type: {},
    };

    for (const c of conflicts) {
      summary.by_type[c.conflict_type] = (summary.by_type[c.conflict_type] || 0) + 1;
    }

    res.json({ conflicts, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
