const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'exam_scheduler.db');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create all tables
db.exec(`
  CREATE TABLE IF NOT EXISTS uploaded_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_name TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    faculty TEXT NOT NULL,
    file_type TEXT DEFAULT 'schedule',
    is_active INTEGER DEFAULT 1,
    upload_status TEXT DEFAULT 'uploaded',
    parse_status TEXT DEFAULT 'pending',
    uploaded_at TEXT DEFAULT (datetime('now')),
    parsed_at TEXT,
    sessions_count INTEGER DEFAULT 0,
    error_message TEXT
  );

  CREATE TABLE IF NOT EXISTS parsed_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uploaded_file_id INTEGER NOT NULL,
    faculty TEXT,
    course_code TEXT,
    course_name TEXT,
    section TEXT,
    activity_type TEXT,
    lecturer TEXT,
    room TEXT,
    room_type TEXT DEFAULT 'room',
    day TEXT,
    start_time TEXT,
    end_time TEXT,
    duration_minutes INTEGER,
    capacity INTEGER DEFAULT 0,
    enrolled_count INTEGER DEFAULT 0,
    is_valid INTEGER DEFAULT 1,
    validation_note TEXT,
    raw_data_json TEXT,
    FOREIGN KEY (uploaded_file_id) REFERENCES uploaded_files(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    faculty TEXT,
    room_name TEXT NOT NULL,
    room_type TEXT DEFAULT 'room',
    capacity INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    UNIQUE(room_name, faculty)
  );

  CREATE TABLE IF NOT EXISTS exam_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_code TEXT,
    course_name TEXT,
    section TEXT,
    lecturer TEXT,
    student_count INTEGER DEFAULT 0,
    faculty TEXT,
    preferred_day TEXT,
    preferred_date TEXT,
    duration_minutes INTEGER DEFAULT 60,
    room_type_preference TEXT DEFAULT 'room',
    notes TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scheduled_exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_request_id INTEGER,
    faculty TEXT,
    day TEXT,
    exam_date TEXT,
    start_time TEXT,
    end_time TEXT,
    duration_minutes INTEGER,
    lecturer TEXT,
    rooms_json TEXT,
    total_capacity INTEGER DEFAULT 0,
    student_count INTEGER DEFAULT 0,
    course_code TEXT,
    course_name TEXT,
    section TEXT,
    status TEXT DEFAULT 'scheduled',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (exam_request_id) REFERENCES exam_requests(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS conflicts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conflict_type TEXT NOT NULL,
    reference_type TEXT,
    reference_id INTEGER,
    faculty TEXT,
    room TEXT,
    lecturer TEXT,
    day TEXT,
    start_time TEXT,
    end_time TEXT,
    message TEXT,
    severity TEXT DEFAULT 'error',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

module.exports = db;
