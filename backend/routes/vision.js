/**
 * Vision Route - AI-powered schedule image parsing using Google Gemini
 * POST /api/vision/parse-image
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');

// Dynamic import of Gemini (handles missing API key gracefully)
let GoogleGenerativeAI;
try {
  GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;
} catch (e) {
  console.warn('Warning: @google/generative-ai not installed');
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Multer for image uploads
const imageDir = path.join(__dirname, '..', 'uploads', 'images');
if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });

const imageUpload = multer({
  dest: imageDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('يجب ان تكون الصورة بصيغة PNG او JPG'));
    }
  },
});

const SYSTEM_PROMPT = `You are a university schedule data extraction AI. Extract ALL lecture sessions from the provided Arabic university schedule image and return them as a JSON array.

TABLE STRUCTURE:
- The table is Arabic (Right-to-Left). The rightmost column has room numbers.
- The top row shows TIME RANGES as column headers.
- Each row after the header represents a ROOM.
- Rows may have multiple day sub-rows (e.g. Sun/Tue/Thu = 3 rows, Mon/Wed = 2 rows).

TIME COLUMN HEADERS (RTL Arabic format - smaller number is START, larger is END):
  "9-8"     = 08:00 to 09:00
  "10-9"    = 09:00 to 10:00
  "9.30-8"  = 08:00 to 09:30
  "10.30-9" = 09:00 to 10:30
  "11-10"   = 10:00 to 11:00
  "12-11"   = 11:00 to 12:00
  "1-12"    = 12:00 to 13:00
  "13.30-12"= 12:00 to 13:30
  "2-1"     = 13:00 to 14:00
  "15-14"   = 14:00 to 15:00
  "4-2"     = 14:00 to 16:00
  "4-15"    = 15:00 to 16:00

RULES FOR READING CELLS:
1. session start_time = the START of the leftmost column the cell occupies
2. session end_time = the END of the rightmost column the cell occupies
3. A cell spanning 2 columns: combine their time ranges
4. A cell filling half a column: add/subtract 30 minutes
5. EMPTY cell = no session - do not create a record
6. Only extract cells that have visible text/content

DAY ABBREVIATIONS:
  The rows on the left side of each room show the day:
  "ح" or "الاحد" = sunday
  "ن" or "الاثنين" = monday
  "ث" or "الثلاثاء" = tuesday
  "ر" or "الاربعاء" = wednesday
  "خ" or "الخميس" = thursday

  If a row label is "ح/ث/خ" it means the same session is on sunday, tuesday, thursday -> create 3 separate JSON objects.
  If a row label is "ن/ر" it means monday AND wednesday -> create 2 separate JSON objects.
  If the cell text says "فقط احد" or "فقط ح" it means ONLY sunday -> 1 object.
  If the cell text says "فقط اثنين" or "فقط ن" it means ONLY monday -> 1 object.

OUTPUT FORMAT:
Return ONLY a valid JSON array with no markdown, no explanation. Each object must have:
  "room": room number string (e.g. "2101")
  "day": one of "sunday","monday","tuesday","wednesday","thursday"
  "start_time": 24-hour "HH:MM" (e.g. "08:00")
  "end_time": 24-hour "HH:MM" (e.g. "09:30")
  "course_name": course name string or null
  "lecturer": lecturer name string or null
  "activity_type": "عملي" or "نظري" or null

If the image is unreadable, return [].`;

// POST /api/vision/parse-image
router.post('/parse-image', imageUpload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'لم يتم رفع اي صورة' });
  }

  const { faculty } = req.body;
  if (!faculty) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'يجب تحديد الكلية / المصدر' });
  }

  if (!GEMINI_API_KEY) {
    fs.unlinkSync(req.file.path);
    return res.status(503).json({
      error: 'GEMINI_API_KEY غير مضبوط. اضف مفتاحك في ملف .env',
      help: 'اضف: GEMINI_API_KEY=your_key في backend/.env'
    });
  }

  try {
    // Read image as base64
    const imageBuffer = fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';

    // Call Gemini Vision
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const result = await model.generateContent([
      SYSTEM_PROMPT,
      {
        inlineData: {
          data: base64Image,
          mimeType,
        },
      },
    ]);

    const text = result.response.text().trim();

    // Parse the JSON from AI response
    let sessions = [];
    try {
      // Strip markdown code blocks if present
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      sessions = JSON.parse(cleaned);
      if (!Array.isArray(sessions)) sessions = [];
    } catch (parseErr) {
      console.error('JSON parse error from Gemini:', text);
      return res.status(422).json({
        error: 'لم يتمكن الذكاء الاصطناعي من قراءة الجدول بشكل صحيح',
        raw: text,
      });
    }

    if (sessions.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.json({ success: true, sessions_count: 0, message: 'لم يتم اكتشاف اي جلسات في الصورة' });
    }

    // Create upload record
    db.prepare('UPDATE uploaded_files SET is_active = 0 WHERE LOWER(faculty) = LOWER(?)').run(faculty);
    const fileResult = db.prepare(`
      INSERT INTO uploaded_files (original_name, stored_path, faculty, is_active, upload_status, parse_status)
      VALUES (?, ?, ?, 1, 'uploaded', 'success')
    `).run(req.file.originalname || 'image_schedule', req.file.path, faculty);

    const fileId = fileResult.lastInsertRowid;

    // Map sessions to DB format
    const insertSession = db.prepare(`
      INSERT INTO parsed_sessions (
        uploaded_file_id, faculty, course_code, course_name, section,
        activity_type, lecturer, room, room_type, day,
        start_time, end_time, duration_minutes, capacity, enrolled_count,
        is_valid, validation_note, raw_data_json
      ) VALUES (?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, NULL, ?)
    `);

    const roomSet = {};
    let inserted = 0;
    let skippedCount = 0;

    const insertTx = db.transaction(() => {
      for (const s of sessions) {
        if (!s.room || !s.day || !s.start_time || !s.end_time) { skippedCount++; continue; }

        // Check room restriction - only allow target labs
        const r = String(s.room).toLowerCase().trim();
        if (!(r.startsWith('21') || r.startsWith('74') || r === '7325')) {
          skippedCount++;
          continue; // strictly ignore non-labs
        }
        const roomType = 'lab';

        const startParts = s.start_time.split(':').map(Number);
        const endParts   = s.end_time.split(':').map(Number);

        let startMin = startParts[0] * 60 + (startParts[1] || 0);
        let endMin = endParts[0] * 60 + (endParts[1] || 0);

        // Clamp time to bounds: 08:00 - 16:00
        startMin = Math.max(8 * 60, startMin);
        endMin = Math.min(16 * 60, endMin);

        if (startMin >= endMin) { skippedCount++; continue; }

        const clampedStart = `${String(Math.floor(startMin/60)).padStart(2,'0')}:${String(startMin%60).padStart(2,'0')}`;
        const clampedEnd = `${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}`;
        const duration = endMin - startMin;

        insertSession.run(
          fileId, faculty, s.course_name || null,
          s.activity_type || null, s.lecturer || null,
          s.room, roomType, s.day,
          clampedStart, clampedEnd, duration > 0 ? duration : null,
          JSON.stringify(s)
        );

        if (s.room && !roomSet[s.room]) {
          roomSet[s.room] = roomType;
        }
        inserted++;
      }
    });

    insertTx();

    // Upsert rooms
    for (const [roomName, roomType] of Object.entries(roomSet)) {
      db.prepare(`
        INSERT INTO rooms (faculty, room_name, room_type, capacity, is_active)
        VALUES (?, ?, ?, 0, 1)
        ON CONFLICT(room_name, faculty) DO UPDATE SET room_type = excluded.room_type, is_active = 1
      `).run(faculty, roomName, roomType);
    }

    db.prepare('UPDATE uploaded_files SET sessions_count = ? WHERE id = ?').run(inserted, fileId);

    res.json({
      success: true,
      message: `تم استخراج وحفظ ${inserted} جلسة من الصورة! (تم تخطي ${skippedCount} غير صالحة)`,
      sessions_count: inserted,
      skipped: skippedCount,
      rooms_found: Object.keys(roomSet),
      preview: sessions.slice(0, 5),
    });

  } catch (err) {
    console.error('Vision route error:', err);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vision/status - check if vision is configured
router.get('/status', (req, res) => {
  res.json({
    configured: !!GEMINI_API_KEY,
    message: GEMINI_API_KEY
      ? 'Gemini API مضبوط وجاهز'
      : 'اضف GEMINI_API_KEY في ملف backend/.env',
  });
});

module.exports = router;
