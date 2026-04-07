/**
 * Occupancy Engine
 * Builds a room occupancy map from parsed lecture sessions + scheduled exams
 */
const db = require('../db');
const { toMinutes, minutesToTime } = require('./parser');

const WORK_START = 8 * 60;   // 08:00 in minutes
const WORK_END = 16 * 60;    // 16:00 in minutes

/**
 * Get all occupied intervals for a specific room and day.
 * Returns array of { start, end } in minutes.
 */
function getOccupiedIntervals(room, day) {
  const intervals = [];

  // From lecture sessions (only active files, valid sessions)
  const sessions = db.prepare(`
    SELECT ps.start_time, ps.end_time
    FROM parsed_sessions ps
    JOIN uploaded_files uf ON ps.uploaded_file_id = uf.id
    WHERE LOWER(ps.room) = LOWER(?)
      AND LOWER(ps.day) = LOWER(?)
      AND ps.is_valid = 1
      AND uf.is_active = 1
      AND ps.start_time IS NOT NULL
      AND ps.end_time IS NOT NULL
  `).all(room, day);

  for (const s of sessions) {
    const start = toMinutes(s.start_time);
    const end = toMinutes(s.end_time);
    if (start < end && start >= WORK_START && end <= WORK_END) {
      intervals.push({ start, end });
    }
  }

  // From scheduled exams
  const exams = db.prepare(`
    SELECT se.start_time, se.end_time, se.rooms_json
    FROM scheduled_exams se
    WHERE LOWER(se.day) = LOWER(?)
      AND se.status != 'cancelled'
      AND se.start_time IS NOT NULL
      AND se.end_time IS NOT NULL
  `).all(day);

  for (const exam of exams) {
    let rooms = [];
    try { rooms = JSON.parse(exam.rooms_json || '[]'); } catch (e) {}
    if (rooms.some(r => r.toLowerCase() === room.toLowerCase())) {
      const start = toMinutes(exam.start_time);
      const end = toMinutes(exam.end_time);
      if (start < end) intervals.push({ start, end });
    }
  }

  return mergeIntervals(intervals);
}

/**
 * Merge overlapping intervals
 */
function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start < last.end) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push({ ...sorted[i] });
    }
  }
  return merged;
}

/**
 * Standard university time slots by day
 */
const STANDARD_SLOTS = {
  // Mon / Wed (1.5 hours)
  monday: [
    { start: 8*60, end: 9*60+30 },
    { start: 9*60+30, end: 11*60 },
    { start: 11*60, end: 12*60+30 },
    { start: 12*60+30, end: 14*60 },
    { start: 14*60, end: 15*60+30 },
  ],
  wednesday: [
    { start: 8*60, end: 9*60+30 },
    { start: 9*60+30, end: 11*60 },
    { start: 11*60, end: 12*60+30 },
    { start: 12*60+30, end: 14*60 },
    { start: 14*60, end: 15*60+30 },
  ],
  // Sun / Tue / Thu (1 hour)
  default: [
    { start: 8*60, end: 9*60 },
    { start: 9*60, end: 10*60 },
    { start: 10*60, end: 11*60 },
    { start: 11*60, end: 12*60 },
    { start: 12*60, end: 13*60 },
    { start: 13*60, end: 14*60 },
    { start: 14*60, end: 15*60 },
    { start: 15*60, end: 16*60 },
  ]
};

/**
 * Subtract occupied intervals from standard academic slots
 * Returns an array of free standard slots
 */
function computeFreeIntervals(occupied, day) {
  const merged = mergeIntervals(occupied);
  const free = [];
  
  const slotsConfig = STANDARD_SLOTS[day] || STANDARD_SLOTS.default;
  
  for (const slot of slotsConfig) {
    // Check if this standard slot overlaps with ANY occupied interval
    let isOverlap = false;
    for (const occ of merged) {
      if (slot.start < occ.end && slot.end > occ.start) {
        isOverlap = true;
        break;
      }
    }
    if (!isOverlap) {
      free.push({ start: slot.start, end: slot.end });
    }
  }

  // Any remaining fully free time outside standard slots? 
  // Let's just return the standard slots for a cleaner UI since the user wants standard periods
  return free;
}

/**
 * Get free slots for a room on a specific day
 */
function getRoomFreeSlots(room, day) {
  const occupied = getOccupiedIntervals(room, day);
  const free = computeFreeIntervals(occupied, day);
  return {
    occupied: occupied.map(i => ({
      start: minutesToTime(i.start),
      end: minutesToTime(i.end),
      duration: i.end - i.start,
    })),
    free: free.map(i => ({
      start: minutesToTime(i.start),
      end: minutesToTime(i.end),
      duration: i.end - i.start,
    })),
  };
}

/**
 * Check if a room is free for a given day + start + end (in minutes)
 */
function isRoomFree(room, day, startMin, endMin) {
  const occupied = getOccupiedIntervals(room, day);
  for (const occ of occupied) {
    if (startMin < occ.end && endMin > occ.start) return false;
  }
  return true;
}

/**
 * Check if a lecturer is free for a given day + start + end
 */
function isLecturerFree(lecturer, day, startMin, endMin) {
  if (!lecturer) return true;

  // Check lecture sessions
  const sessions = db.prepare(`
    SELECT ps.start_time, ps.end_time
    FROM parsed_sessions ps
    JOIN uploaded_files uf ON ps.uploaded_file_id = uf.id
    WHERE LOWER(ps.lecturer) = LOWER(?)
      AND LOWER(ps.day) = LOWER(?)
      AND ps.is_valid = 1
      AND uf.is_active = 1
      AND ps.start_time IS NOT NULL
      AND ps.end_time IS NOT NULL
  `).all(lecturer, day);

  for (const s of sessions) {
    const start = toMinutes(s.start_time);
    const end = toMinutes(s.end_time);
    if (startMin < end && endMin > start) return false;
  }

  // Check scheduled exams
  const exams = db.prepare(`
    SELECT start_time, end_time
    FROM scheduled_exams
    WHERE LOWER(lecturer) = LOWER(?)
      AND LOWER(day) = LOWER(?)
      AND status != 'cancelled'
  `).all(lecturer, day);

  for (const e of exams) {
    const start = toMinutes(e.start_time);
    const end = toMinutes(e.end_time);
    if (startMin < end && endMin > start) return false;
  }

  return true;
}

/**
 * Get all distinct rooms from active lecture schedules
 */
function getAllRooms(faculty = null) {
  let query = `
    SELECT DISTINCT r.room_name, r.room_type, r.capacity, r.faculty
    FROM rooms r
    WHERE r.is_active = 1
  `;
  const params = [];
  if (faculty) {
    query += ' AND LOWER(r.faculty) = LOWER(?)';
    params.push(faculty);
  }
  return db.prepare(query).all(...params);
}

module.exports = {
  getOccupiedIntervals,
  computeFreeIntervals,
  getRoomFreeSlots,
  isRoomFree,
  isLecturerFree,
  getAllRooms,
  mergeIntervals,
  toMinutes,
  minutesToTime,
  WORK_START,
  WORK_END,
};
