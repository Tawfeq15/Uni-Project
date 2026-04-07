const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /dashboard/stats
router.get('/stats', (req, res) => {
  try {
    const uploadedFiles = db.prepare(`SELECT COUNT(*) as cnt FROM uploaded_files WHERE is_active = 1`).get().cnt;
    const totalFiles = db.prepare(`SELECT COUNT(*) as cnt FROM uploaded_files`).get().cnt;
    const totalSessions = db.prepare(`
      SELECT COUNT(*) as cnt FROM parsed_sessions ps
      JOIN uploaded_files uf ON ps.uploaded_file_id = uf.id
      WHERE uf.is_active = 1 AND ps.is_valid = 1
    `).get().cnt;
    const totalRooms = db.prepare(`SELECT COUNT(*) as cnt FROM rooms WHERE is_active = 1 AND room_type = 'room'`).get().cnt;
    const totalLabs = db.prepare(`SELECT COUNT(*) as cnt FROM rooms WHERE is_active = 1 AND room_type = 'lab'`).get().cnt;
    const examRequests = db.prepare(`SELECT COUNT(*) as cnt FROM exam_requests`).get().cnt;
    const scheduledExams = db.prepare(`SELECT COUNT(*) as cnt FROM scheduled_exams WHERE status = 'scheduled'`).get().cnt;
    const unscheduled = db.prepare(`SELECT COUNT(*) as cnt FROM exam_requests WHERE status = 'pending'`).get().cnt;
    const conflicts = db.prepare(`SELECT COUNT(*) as cnt FROM conflicts WHERE severity = 'error'`).get().cnt;

    // By faculty
    const byFaculty = db.prepare(`
      SELECT ps.faculty, COUNT(*) as sessions, COUNT(DISTINCT ps.room) as rooms
      FROM parsed_sessions ps
      JOIN uploaded_files uf ON ps.uploaded_file_id = uf.id
      WHERE uf.is_active = 1 AND ps.is_valid = 1
      GROUP BY ps.faculty
    `).all();

    const scheduledByFaculty = db.prepare(`
      SELECT faculty, COUNT(*) as exams
      FROM scheduled_exams
      WHERE status = 'scheduled'
      GROUP BY faculty
    `).all();

    res.json({
      uploaded_files: uploadedFiles,
      total_files: totalFiles,
      total_sessions: totalSessions,
      total_rooms: totalRooms,
      total_labs: totalLabs,
      exam_requests: examRequests,
      scheduled_exams: scheduledExams,
      unscheduled_exams: unscheduled,
      conflicts,
      by_faculty: byFaculty,
      scheduled_by_faculty: scheduledByFaculty,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /dashboard/reset
router.post('/reset', (req, res) => {
  try {
    const trx = db.transaction(() => {
      // Clear scheduling and parsing data, but keep rooms intact!
      // The user wants to start fresh with a new excel, so we wipe:
      // uploaded_files, parsed_sessions, exam_requests, scheduled_exams, conflicts
      db.prepare(`DELETE FROM conflicts`).run();
      db.prepare(`DELETE FROM scheduled_exams`).run();
      db.prepare(`DELETE FROM exam_requests_rooms`).run();
      db.prepare(`DELETE FROM exam_requests`).run();
      db.prepare(`DELETE FROM parsed_sessions`).run();
      db.prepare(`DELETE FROM uploaded_files`).run();
      
      // Optionally reset SQLite sequence (auto-increment IDs) if exists
      try {
        db.prepare(`UPDATE sqlite_sequence SET seq = 0 WHERE name IN ('conflicts', 'scheduled_exams', 'exam_requests_rooms', 'exam_requests', 'parsed_sessions', 'uploaded_files')`).run();
      } catch (e) {
        // Ignore if sqlite_sequence not found
      }
    });
    
    trx();
    res.json({ success: true, message: 'تم تفريغ كافة البيانات بنجاح.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
