const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /sessions
router.get('/', (req, res) => {
  try {
    const { faculty, day, room, lecturer, room_type, file_id, page = 1, limit = 100 } = req.query;

    let where = ['ps.is_valid = 1', 'uf.is_active = 1'];
    const params = [];

    if (faculty) { where.push('LOWER(ps.faculty) = LOWER(?)'); params.push(faculty); }
    if (day) { where.push('LOWER(ps.day) = LOWER(?)'); params.push(day); }
    if (room) { where.push('LOWER(ps.room) LIKE LOWER(?)'); params.push(`%${room}%`); }
    if (lecturer) { where.push('LOWER(ps.lecturer) LIKE LOWER(?)'); params.push(`%${lecturer}%`); }
    if (room_type) { where.push('LOWER(ps.room_type) = LOWER(?)'); params.push(room_type); }
    if (file_id) { where.push('ps.uploaded_file_id = ?'); params.push(file_id); }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countRow = db.prepare(`
      SELECT COUNT(*) as total
      FROM parsed_sessions ps
      JOIN uploaded_files uf ON ps.uploaded_file_id = uf.id
      ${whereStr}
    `).get(...params);

    const sessions = db.prepare(`
      SELECT ps.*, uf.original_name as source_file
      FROM parsed_sessions ps
      JOIN uploaded_files uf ON ps.uploaded_file_id = uf.id
      ${whereStr}
      ORDER BY ps.faculty, ps.day, ps.start_time
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

    res.json({
      sessions,
      total: countRow.total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /sessions/all (no filter, for internal use)
router.get('/all-invalid', (req, res) => {
  try {
    const sessions = db.prepare(`
      SELECT ps.*, uf.original_name as source_file
      FROM parsed_sessions ps
      JOIN uploaded_files uf ON ps.uploaded_file_id = uf.id
      WHERE ps.is_valid = 0
      ORDER BY ps.uploaded_file_id
    `).all();
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /sessions/filters – get distinct filter values
router.get('/filters', (req, res) => {
  try {
    const faculties = db.prepare(`SELECT DISTINCT faculty FROM parsed_sessions WHERE faculty IS NOT NULL ORDER BY faculty`).all().map(r => r.faculty);
    const days = db.prepare(`SELECT DISTINCT day FROM parsed_sessions WHERE day IS NOT NULL ORDER BY day`).all().map(r => r.day);
    const rooms = db.prepare(`SELECT DISTINCT room FROM parsed_sessions WHERE room IS NOT NULL ORDER BY room`).all().map(r => r.room);
    const lecturers = db.prepare(`SELECT DISTINCT lecturer FROM parsed_sessions WHERE lecturer IS NOT NULL ORDER BY lecturer`).all().map(r => r.lecturer);

    res.json({ faculties, days, rooms, lecturers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
