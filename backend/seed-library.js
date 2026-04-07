/**
 * Library Schedule Seed Script
 * Manually transcribed from the paper image provided by the user.
 * Rooms: 2101, 2102, 2103, 2104, 2105, 2106, 2107 - all are LABS (مختبرات مكتبة)
 * Days: Sunday(ح), Monday(ن), Tuesday(ث), Wednesday(ر), Thursday(خ)
 * Times read from image columns: 8-9, 9-10, 10-11, 11-12, 12-1, 1-2, 2-4 (note 2-4 is a double slot)
 */

const db = require('./db');

const FACULTY = 'library';

// Helper to convert time like "08:00" 
function t(h, m = 0) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Sessions transcribed from the image
// Format: { room, day, start, end, course_name, lecturer }
// ح=sunday, ن=monday, ث=tuesday, ر=wednesday, خ=thursday
const RAW_SESSIONS = [
  // ===== قاعة 2101 =====
  // 10-11 row: has something on ح and ث
  { room: '2101', day: 'monday',    start: t(15), end: t(16),   course_name: 'مصادر معلومات', activity_type: 'عملي' },
  { room: '2101', day: 'tuesday',   start: t(10), end: t(11),   course_name: 'مصادر معلومات', activity_type: 'عملي' },
  { room: '2101', day: 'wednesday', start: t(10), end: t(11),   course_name: 'مصادر معلومات', activity_type: 'عملي' },
  { room: '2101', day: 'thursday',  start: t(10,30), end: t(12), course_name: 'مصادر معلومات', activity_type: 'عملي' },

  // ===== قاعة 2102 =====
  { room: '2102', day: 'sunday',    start: t(9,30), end: t(11),  course_name: 'خدمات التعلم الإلكتروني (1)', activity_type: 'عملي' },
  { room: '2102', day: 'monday',    start: t(9,30), end: t(11),  course_name: 'خدمات التعلم الإلكتروني (1)', activity_type: 'عملي' },
  { room: '2102', day: 'tuesday',   start: t(11), end: t(12),    course_name: 'تصميم مواقع', activity_type: 'عملي' },
  { room: '2102', day: 'wednesday', start: t(11), end: t(12),    course_name: 'تصميم مواقع', activity_type: 'عملي' },
  { room: '2102', day: 'thursday',  start: t(15), end: t(16),    course_name: 'خدمات التعلم الإلكتروني (1)', activity_type: 'عملي' },

  // ===== قاعة 2103 =====
  { room: '2103', day: 'sunday',    start: t(10,30), end: t(12), course_name: 'تقنية برمجيات المكتبات (1)', activity_type: 'عملي' },
  { room: '2103', day: 'monday',    start: t(10,30), end: t(12), course_name: 'تقنية برمجيات المكتبات 5', activity_type: 'عملي' },
  { room: '2103', day: 'tuesday',   start: t(9,30), end: t(11),  course_name: 'تقنية برمجيات المكتبات 3', activity_type: 'عملي' },
  { room: '2103', day: 'wednesday', start: t(9,30), end: t(11),  course_name: 'تقنية برمجيات المكتبات 3', activity_type: 'عملي' },
  { room: '2103', day: 'thursday',  start: t(11), end: t(12),    course_name: 'تقنية برمجيات المكتبات (1)', activity_type: 'عملي' },
  { room: '2103', day: 'thursday',  start: t(13), end: t(15),    course_name: 'استرجاع المعلومات', activity_type: 'عملي' },

  // ===== قاعة 2104 =====
  { room: '2104', day: 'sunday',    start: t(9,30), end: t(11),  course_name: 'محاضرات عامة', activity_type: 'عملي' },
  { room: '2104', day: 'monday',    start: t(11), end: t(13),    course_name: 'تصميم المواقع', activity_type: 'عملي' },
  { room: '2104', day: 'tuesday',   start: t(14), end: t(16),    course_name: 'تصميم المواقع (2)', activity_type: 'عملي' },
  { room: '2104', day: 'wednesday', start: t(9,30), end: t(11),  course_name: 'تقنية المعلومات', activity_type: 'عملي' },
  { room: '2104', day: 'thursday',  start: t(9,30), end: t(11),  course_name: 'محاضرات عامة', activity_type: 'عملي' },

  // ===== قاعة 2105 =====
  { room: '2105', day: 'sunday',    start: t(8), end: t(9,30),   course_name: 'تصميم مواقع', activity_type: 'عملي' },
  { room: '2105', day: 'sunday',    start: t(15), end: t(16),    course_name: 'تصميم مواقع (2)', activity_type: 'عملي' },
  { room: '2105', day: 'monday',    start: t(11), end: t(12),    course_name: 'برمجيات المكتبات', activity_type: 'عملي' },
  { room: '2105', day: 'tuesday',   start: t(14), end: t(16),    course_name: 'برمجيات المكتبات (2)', activity_type: 'عملي', lecturer: 'د. فخر' },
  { room: '2105', day: 'wednesday', start: t(14), end: t(16),    course_name: 'برمجيات المكتبات (2)', activity_type: 'عملي', lecturer: 'د. فخر' },
  { room: '2105', day: 'thursday',  start: t(15), end: t(16),    course_name: 'تصميم مواقع (2)', activity_type: 'عملي' },

  // ===== قاعة 2106 =====
  { room: '2106', day: 'sunday',    start: t(8), end: t(9,30),   course_name: 'خدمات المكتبات الرقمية', activity_type: 'عملي' },
  { room: '2106', day: 'monday',    start: t(12), end: t(13),    course_name: 'خدمات المكتبات (1)', activity_type: 'عملي' },
  { room: '2106', day: 'tuesday',   start: t(8), end: t(9,30),   course_name: 'خدمات المكتبات الرقمية', activity_type: 'عملي' },
  { room: '2106', day: 'wednesday', start: t(14,30), end: t(16), course_name: 'خدمات التقنية للمكتبات', activity_type: 'عملي' },
  { room: '2106', day: 'thursday',  start: t(14,30), end: t(16), course_name: 'خدمات التقنية للمكتبات (2)', activity_type: 'عملي' },

  // ===== قاعة 2107 =====
  { room: '2107', day: 'sunday',    start: t(13,30), end: t(15), course_name: 'تحليل الأنظمة', activity_type: 'عملي' },
  { room: '2107', day: 'monday',    start: t(11), end: t(12),    course_name: 'قواعد بيانات', activity_type: 'عملي' },
  { room: '2107', day: 'tuesday',   start: t(8), end: t(9,30),   course_name: 'قواعد بيانات (2)', activity_type: 'عملي' },
  { room: '2107', day: 'wednesday', start: t(13,30), end: t(15), course_name: 'مشاريع تخرج', activity_type: 'عملي' },
  { room: '2107', day: 'thursday',  start: t(13,30), end: t(15), course_name: 'تحليل الأنظمة (2)', activity_type: 'عملي' },
];

console.log(`\n📚 Seeding Library Schedule (${RAW_SESSIONS.length} sessions)...\n`);

// 1. Create or get a library "uploaded_files" placeholder record
db.prepare(`UPDATE uploaded_files SET is_active = 0 WHERE LOWER(faculty) = LOWER(?)`).run(FACULTY);

const fileResult = db.prepare(`
  INSERT INTO uploaded_files (original_name, stored_path, faculty, is_active, upload_status, parse_status, sessions_count)
  VALUES ('جدول المكتبة - يدوي', 'manual_entry', ?, 1, 'uploaded', 'success', ?)
`).run(FACULTY, RAW_SESSIONS.length);

const fileId = fileResult.lastInsertRowid;
console.log(`✅ Created upload record ID=${fileId}`);

// 2. Clear any old library sessions
db.prepare(`DELETE FROM parsed_sessions WHERE faculty = ?`).run(FACULTY);

// 3. Ensure library rooms exist in the rooms table
const libRooms = [...new Set(RAW_SESSIONS.map(s => s.room))];
for (const roomName of libRooms) {
  db.prepare(`
    INSERT INTO rooms (faculty, room_name, room_type, capacity, is_active)
    VALUES (?, ?, 'lab', 0, 1)
    ON CONFLICT(room_name, faculty) DO UPDATE SET room_type = 'lab', is_active = 1
  `).run(FACULTY, roomName);
  console.log(`  🏛️  Ensured room ${roomName} (lab, capacity=0)`);
}

// 4. Insert sessions
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
    1, NULL, @raw_data_json
  )
`);

const seedTx = db.transaction((sessions) => {
  for (const s of sessions) {
    const startMin = parseInt(s.start.split(':')[0]) * 60 + parseInt(s.start.split(':')[1]);
    const endMin   = parseInt(s.end.split(':')[0])   * 60 + parseInt(s.end.split(':')[1]);
    insertSession.run({
      uploaded_file_id: fileId,
      faculty: FACULTY,
      course_code: null,
      course_name: s.course_name,
      section: null,
      activity_type: s.activity_type || 'عملي',
      lecturer: s.lecturer || null,
      room: s.room,
      room_type: 'lab',
      day: s.day,
      start_time: s.start,
      end_time: s.end,
      duration_minutes: endMin - startMin,
      capacity: 0,
      enrolled_count: 0,
      raw_data_json: JSON.stringify(s),
    });
  }
});

seedTx(RAW_SESSIONS);

console.log(`\n✅ Seeded ${RAW_SESSIONS.length} library sessions successfully!\n`);
console.log('Rooms added:', libRooms.join(', '));
