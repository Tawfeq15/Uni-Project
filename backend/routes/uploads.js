const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { parseExcelFile } = require('../services/parser');

// Setup multer for file uploads
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) cb(null, true);
    else cb(new Error('يجب أن يكون الملف بصيغة Excel'));
  },
});

// POST /uploads – upload a new schedule file
router.post('/', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'لم يتم رفع أي ملف' });

    // Parse first to discover which faculties are present
    let parseResult;
    try {
      parseResult = parseExcelFile(req.file.path);
    } catch (parseError) {
      return res.status(422).json({
        error: 'فشل تحليل الملف: ' + parseError.message,
      });
    }

    const { sessions, rooms, faculties } = parseResult;

    // Detected faculties (e.g. ['library', 'it'] or just one)
    const detectedFaculties = faculties && faculties.length > 0
      ? faculties
      : ['unknown'];

    // Use the detected faculties as the label for the upload record.
    // If both IT and Library in same file, label = 'mixed'
    const facultyLabel = detectedFaculties.length > 1
      ? 'mixed'
      : detectedFaculties[0];

    // Deactivate old files for the same detected faculty/faculties
    for (const f of detectedFaculties) {
      db.prepare('UPDATE uploaded_files SET is_active = 0 WHERE LOWER(faculty) = LOWER(?)').run(f);
    }

    // Insert new file record
    const result = db.prepare(`
      INSERT INTO uploaded_files (original_name, stored_path, faculty, is_active, upload_status, parse_status)
      VALUES (?, ?, ?, 1, 'uploaded', 'pending')
    `).run(req.file.originalname, req.file.path, facultyLabel);

    const fileId = result.lastInsertRowid;

    // Parse sessions
    try {
      const { sessions, rooms } = parseResult;

      // Delete old sessions for detected faculties
      const oldFiles = db.prepare(`
        SELECT id FROM uploaded_files WHERE faculty IN (${ detectedFaculties.map(() => '?').join(',') }) AND id != ?
      `).all(...detectedFaculties, fileId);

      for (const old of oldFiles) {
        db.prepare('DELETE FROM parsed_sessions WHERE uploaded_file_id = ?').run(old.id);
      }

      // Insert sessions
      const insertSession = db.prepare(`
        INSERT INTO parsed_sessions (
          uploaded_file_id, faculty, course_code, course_name, section,
          activity_type, lecturer, room, room_type, day,
          start_time, end_time, duration_minutes, capacity, enrolled_count,
          is_valid, validation_note, raw_data_json
        ) VALUES (
          @uploaded_file_id, @faculty, @course_code, @course_name, @section,
          @activity_type, @lecturer, @room, @room_type, @day,
          @start_time, @end_time, @duration_minutes, @capacity, @enrolled_count,
          @is_valid, @validation_note, @raw_data_json
        )
      `);

      const insertMany = db.transaction((items) => {
        for (const item of items) {
          insertSession.run({ uploaded_file_id: fileId, ...item });
        }
      });

      insertMany(sessions);

      // Upsert rooms
      for (const room of rooms) {
        db.prepare(`
          INSERT INTO rooms (faculty, room_name, room_type, capacity, is_active)
          VALUES (?, ?, ?, ?, 1)
          ON CONFLICT(room_name, faculty) DO UPDATE SET
            room_type = excluded.room_type,
            capacity = MAX(rooms.capacity, excluded.capacity),
            is_active = 1
        `).run(room.faculty, room.room_name, room.room_type, room.capacity);
      }

      // Update file record with parse result
      db.prepare(`
        UPDATE uploaded_files
        SET parse_status = 'success', parsed_at = datetime('now'), sessions_count = ?
        WHERE id = ?
      `).run(sessions.length, fileId);

      const fileRecord = db.prepare('SELECT * FROM uploaded_files WHERE id = ?').get(fileId);
      return res.json({
        success: true,
        message: `تم الرفع وتحليل الملف بنجاح`,
        file: fileRecord,
        faculties_detected: detectedFaculties,
        sessions_count: sessions.length,
        rooms_count: rooms.length,
      });

    } catch (parseError) {
      db.prepare(`
        UPDATE uploaded_files
        SET parse_status = 'error', error_message = ?
        WHERE id = ?
      `).run(parseError.message, fileId);

      return res.json({
        success: true,
        warning: true,
        message: 'تم الرفع لكن فشل التحليل',
        error: parseError.message,
        file: db.prepare('SELECT * FROM uploaded_files WHERE id = ?').get(fileId),
      });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /uploads – list all uploaded files
router.get('/', (req, res) => {
  try {
    const files = db.prepare(`
      SELECT * FROM uploaded_files ORDER BY uploaded_at DESC
    `).all();
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /uploads/:id
router.delete('/:id', (req, res) => {
  try {
    const file = db.prepare('SELECT * FROM uploaded_files WHERE id = ?').get(req.params.id);
    if (!file) return res.status(404).json({ error: 'الملف غير موجود' });

    // Delete file from disk
    if (fs.existsSync(file.stored_path)) {
      fs.unlinkSync(file.stored_path);
    }

    // Delete from DB (cascade deletes sessions)
    db.prepare('DELETE FROM uploaded_files WHERE id = ?').run(req.params.id);

    res.json({ success: true, message: 'تم الحذف بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /uploads/:id/reparse
router.post('/:id/reparse', (req, res) => {
  try {
    const file = db.prepare('SELECT * FROM uploaded_files WHERE id = ?').get(req.params.id);
    if (!file) return res.status(404).json({ error: 'الملف غير موجود' });
    if (!fs.existsSync(file.stored_path)) return res.status(400).json({ error: 'الملف غير موجود على القرص' });

    // Delete old sessions
    db.prepare('DELETE FROM parsed_sessions WHERE uploaded_file_id = ?').run(file.id);

    const { sessions, rooms } = parseExcelFile(file.stored_path);


    const insertSession = db.prepare(`
      INSERT INTO parsed_sessions (
        uploaded_file_id, faculty, course_code, course_name, section,
        activity_type, lecturer, room, room_type, day,
        start_time, end_time, duration_minutes, capacity, enrolled_count,
        is_valid, validation_note, raw_data_json
      ) VALUES (
        @uploaded_file_id, @faculty, @course_code, @course_name, @section,
        @activity_type, @lecturer, @room, @room_type, @day,
        @start_time, @end_time, @duration_minutes, @capacity, @enrolled_count,
        @is_valid, @validation_note, @raw_data_json
      )
    `);

    db.transaction((items) => {
      for (const item of items) insertSession.run({ uploaded_file_id: file.id, ...item });
    })(sessions);

    for (const room of rooms) {
      db.prepare(`
        INSERT INTO rooms (faculty, room_name, room_type, capacity, is_active)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(room_name, faculty) DO UPDATE SET
          room_type = excluded.room_type,
          capacity = MAX(rooms.capacity, excluded.capacity)
      `).run(room.faculty, room.room_name, room.room_type, room.capacity);
    }

    db.prepare(`
      UPDATE uploaded_files
      SET parse_status = 'success', parsed_at = datetime('now'), sessions_count = ?, error_message = NULL
      WHERE id = ?
    `).run(sessions.length, file.id);

    res.json({ success: true, sessions_count: sessions.length, rooms_count: rooms.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
