/**
 * Grid Schedule Parser
 * Handles Arabic-university-style timetable grids where:
 *   - Rows = Rooms (e.g. 2101, 2102...)
 *   - Sub-rows = Day groups (ح/ث/خ = Sun/Tue/Thu, ن/ر = Mon/Wed)
 *   - Columns = Time slots (headers like "9-8", "10.30-9", "4-2", etc.)
 *
 * Also supports the flat row-per-session format as a fallback.
 */

const XLSX = require('xlsx');

// ── Lab room filter ──────────────────────────────────────────────────────────
function isTargetLabRoom(room) {
  if (!room) return false;
  const r = String(room).trim().toLowerCase();
  return r.startsWith('21') || r.startsWith('74') || r === '7325';
}

/**
 * Auto-detect which faculty/building a room belongs to.
 * 21xx → 'library' (Library building)
 * 74xx or 7325 → 'it' (IT building)
 */
function detectFaculty(room) {
  if (!room) return 'unknown';
  const r = String(room).trim();
  if (r.startsWith('21')) return 'library';
  if (r.startsWith('74') || r === '7325') return 'it';
  return 'unknown';
}

// ── Time helpers ─────────────────────────────────────────────────────────────
function toMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = String(timeStr).split(':').map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const WORK_START = 8 * 60;   // 08:00
const WORK_END   = 16 * 60;  // 16:00

/**
 * Parse an RTL time-range header like:
 *   "9-8"      → { start: 480, end: 540 }    (08:00 – 09:00)
 *   "10-9"     → { start: 540, end: 600 }
 *   "9.30-8"   → { start: 480, end: 570 }
 *   "10.30-9"  → { start: 540, end: 630 }
 *   "4-2"      → { start: 840, end: 960 }
 *   "13.30"    → null (not a range)
 */
function parseTimeHeader(raw) {
  if (!raw) return null;
  const s = String(raw).trim().replace(/\s+/g, '');

  // Match "A.B-C" or "A-B" patterns (RTL: end-start)
  const m = s.match(/^(\d+)(?:[.،](\d+))?[-–](\d+)(?:[.،](\d+))?$/);
  if (!m) return null;

  const endH = parseInt(m[1]);
  const endM = m[2] ? parseInt(m[2]) : 0;
  const startH = parseInt(m[3]);
  const startM = m[4] ? parseInt(m[4]) : 0;

  const startMin = startH * 60 + startM;
  let   endMin   = endH   * 60 + endM;

  // Sanity: end must be > start (within work hours)
  if (endMin <= startMin) {
    // Could be AM/PM confusion – try adding 12h to end if it makes sense
    if (endMin + 12 * 60 > startMin && endMin + 12 * 60 <= WORK_END) {
      endMin += 12 * 60;
    } else {
      return null;
    }
  }

  // Clamp both to [WORK_START, WORK_END]
  const clampedStart = Math.max(WORK_START, startMin);
  const clampedEnd   = Math.min(WORK_END,   endMin);
  if (clampedStart >= clampedEnd) return null;

  return { start: clampedStart, end: clampedEnd };
}

// ── Day mapping ───────────────────────────────────────────────────────────────
const DAY_PATTERNS = [
  { re: /ا?ثنين|ن[/\/]ر|mon/i,                          days: ['monday', 'wednesday'] },
  { re: /ا?ربعاء/i,                                       days: ['wednesday'] },
  { re: /احد|أحد|ح[/\/]ث|sun/i,                          days: ['sunday', 'tuesday', 'thursday'] },
  { re: /ثلاثاء/i,                                        days: ['tuesday'] },
  { re: /خميس/i,                                          days: ['thursday'] },
  { re: /^[ن]$/u,                                         days: ['monday'] },
  { re: /^[ر]$/u,                                         days: ['wednesday'] },
  { re: /^[ح]$/u,                                         days: ['sunday'] },
  { re: /^[ث]$/u,                                         days: ['tuesday'] },
  { re: /^[خ]$/u,                                         days: ['thursday'] },
];

function parseDayCell(raw) {
  if (!raw) return [];
  const s = String(raw).trim();
  for (const { re, days } of DAY_PATTERNS) {
    if (re.test(s)) return days;
  }
  // Handle combined like "ح/ث/خ"
  const combined = [];
  if (/ح/.test(s)) combined.push('sunday');
  if (/ث/.test(s)) combined.push('tuesday');
  if (/خ/.test(s)) combined.push('thursday');
  if (/ن/.test(s)) combined.push('monday');
  if (/ر/.test(s)) combined.push('wednesday');
  if (combined.length) return combined;
  return [];
}

// ── Cell text helpers ─────────────────────────────────────────────────────────
function cellText(cell) {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'object') return String(cell.v ?? cell.w ?? '').trim();
  return String(cell).trim();
}

function isCellEmpty(text) {
  return !text || /^[\s\-–_.]*$/.test(text);
}

/**
 * Try to detect if the sheet is a "grid timetable" (room × time)
 * vs a flat "row per session" table.
 *
 * Heuristic: if the top few cells in row 1 look like time-range headers,
 * it's a grid.
 */
function detectSheetFormat(rows) {
  if (!rows || rows.length < 2) return 'flat';

  // Check if row 0 or row 1 has cells that look like time headers
  for (let r = 0; r < Math.min(4, rows.length); r++) {
    const row = rows[r];
    let timeHeaderCount = 0;
    for (const cell of row) {
      if (parseTimeHeader(cellText(cell)) !== null) timeHeaderCount++;
    }
    if (timeHeaderCount >= 3) return 'grid';
  }
  return 'flat';
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRID PARSER
// Handles Arabic university timetable grid format
// ═══════════════════════════════════════════════════════════════════════════════
function parseGridSheet(rows, faculty) {
  const sessions = [];

  let timeColumns  = []; // [{ colIdx, start, end }, ...]
  let metaCols = [];
  let currentRoom = null;
  let currentDays = [];

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(c => isCellEmpty(cellText(c)))) continue;

    // ── Check if this row is a time header row ──
    const cols = [];
    for (let c = 0; c < row.length; c++) {
      const t = parseTimeHeader(cellText(row[c]));
      if (t) cols.push({ colIdx: c, start: t.start, end: t.end });
    }

    if (cols.length >= 3) {
      // Detected a new header block
      timeColumns = cols;
      const minTimeCol = Math.min(...timeColumns.map(c => c.colIdx));
      metaCols = Array.from({ length: minTimeCol }, (_, i) => i);
      currentRoom = null;  // Reset room on new block
      currentDays = [];    // Reset days on new block
      
      // Look for a day designation in the header row itself (often on the far right)
      for (const cell of row) {
        const days = parseDayCell(cellText(cell));
        if (days.length > 0) {
          currentDays = days;
          break;
        }
      }
      continue; // Skip data extraction for the header row
    }

    if (timeColumns.length === 0) continue; // Waiting for first header

    // ── Parse data row ──
    let foundRoom = false;
    let foundDay  = false;

    for (const c of metaCols) {
      const txt = cellText(row[c]);
      if (isCellEmpty(txt)) continue;

      // Is it a room number?
      if (/^\d{4}/.test(txt) && isTargetLabRoom(txt.trim().split(/\s/)[0])) {
        currentRoom = txt.trim().split(/\s/)[0];
        foundRoom = true;
      }
      // Is it a day designation?
      const days = parseDayCell(txt);
      if (days.length > 0) {
        currentDays = days;
        foundDay = true;
      }
    }

    // If we haven't established room/days yet, skip
    if (!currentRoom || currentDays.length === 0) continue;

    // ── Extract sessions from time columns ──
    for (const tc of timeColumns) {
      const rawCell = cellText(row[tc.colIdx]);
      if (isCellEmpty(rawCell)) continue;

      // Check for "فقط أحد" / "فقط اثنين" override
      let cellDays = [...currentDays];
      if (/فقط.*(احد|أحد|ح\b)/u.test(rawCell)) cellDays = ['sunday'];
      else if (/فقط.*(اثنين|ثنين|ن\b)/u.test(rawCell)) cellDays = ['monday'];
      else if (/فقط.*(ثلاثاء|ث\b)/u.test(rawCell)) cellDays = ['tuesday'];
      else if (/فقط.*(ربعاء|ر\b)/u.test(rawCell)) cellDays = ['wednesday'];
      else if (/فقط.*(خميس|خ\b)/u.test(rawCell)) cellDays = ['thursday'];

      // Check for a time override note in the cell like "10:30ل" or "12:00 ل"
      let startMin = tc.start;
      let endMin   = tc.end;

      const endOverride = rawCell.match(/(\d{1,2})[.:،](\d{2})\s*[لL]/u);
      if (endOverride) {
        const oh = parseInt(endOverride[1]);
        const om = parseInt(endOverride[2]);
        const overrideMin = oh * 60 + om;
        if (overrideMin > startMin && overrideMin <= WORK_END) {
          endMin = overrideMin;
        }
      }

      const startOverride = rawCell.match(/[مM]ن\s*(\d{1,2})[.:،](\d{2})/u);
      if (startOverride) {
        const oh = parseInt(startOverride[1]);
        const om = parseInt(startOverride[2]);
        const overrideMin = oh * 60 + om;
        if (overrideMin >= WORK_START && overrideMin < endMin) {
          startMin = overrideMin;
        }
      }

      // Clean cell text
      const cleanedText = rawCell
        .replace(/فقط\s*(احد|أحد|اثنين|ثلاثاء|ربعاء|خميس|ح|ث|خ|ن|ر)/gu, '')
        .replace(/\d{1,2}[.:،]\d{2}\s*[لL]/gu, '')
        .replace(/[مM]ن\s*\d{1,2}[.:،]\d{2}/gu, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Extract lecturer name
      let courseName = null;
      let lecturer   = null;
      const lecturerMatch = cleanedText.match(/[دأ]\.[^\n\r(1-9)]+/);
      if (lecturerMatch) {
        lecturer = lecturerMatch[0].trim();
        courseName = cleanedText.replace(lecturerMatch[0], '').trim();
      } else {
        courseName = cleanedText || null;
      }

      for (const day of cellDays) {
        const autoFaculty = detectFaculty(currentRoom);
        sessions.push({
          faculty:        autoFaculty,
          course_code:    null,
          course_name:    courseName || null,
          section:        null,
          activity_type:  /عملي|مختبر/.test(rawCell) ? 'عملي' : 'نظري',
          lecturer:       lecturer || null,
          room:           currentRoom,
          room_type:      'lab',
          day,
          start_time:     minutesToTime(startMin),
          end_time:       minutesToTime(endMin),
          duration_minutes: endMin - startMin,
          capacity:       0,
          enrolled_count: 0,
          is_valid:       1,
          validation_note: null,
          raw_data_json:  JSON.stringify({ cell: rawCell, col: tc }),
        });
      }
    }
  }

  return sessions.length > 0 ? sessions : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLAT PARSER (existing row-per-session logic, simplified)
// ═══════════════════════════════════════════════════════════════════════════════
const ARABIC_DAY_MAP = {
  'ح': 'sunday', 'ن': 'monday', 'ث': 'tuesday', 'ر': 'wednesday', 'خ': 'thursday',
  'أحد': 'sunday', 'اثنين': 'monday', 'ثلاثاء': 'tuesday', 'أربعاء': 'wednesday', 'خميس': 'thursday',
  'احد': 'sunday', 'ربعاء': 'wednesday',
  'sun': 'sunday', 'mon': 'monday', 'tue': 'tuesday', 'wed': 'wednesday', 'thu': 'thursday',
  'sunday': 'sunday', 'monday': 'monday', 'tuesday': 'tuesday', 'wednesday': 'wednesday', 'thursday': 'thursday',
};

function parseDayFlat(raw) {
  if (!raw) return [];
  const s = String(raw).toLowerCase().trim();
  const days = new Set();
  for (const [key, val] of Object.entries(ARABIC_DAY_MAP)) {
    if (s.includes(key.toLowerCase())) days.add(val);
  }
  return [...days];
}

function parseTimeRange(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const seps = ['_', '-', '–', ' - ', ' to '];
  for (const sep of seps) {
    if (!s.includes(sep)) continue;
    const parts = s.split(sep).map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    const parseT = (t) => {
      const m = t.match(/\d{1,2}[:.]\d{2}/);
      if (m) {
        const normalized = m[0].replace('.', ':');
        const [h, mn] = normalized.split(':').map(Number);
        return h * 60 + mn;
      }
      return null;
    };

    let s1 = parseT(parts[0]);
    let e1 = parseT(parts[1]);
    if (s1 === null || e1 === null) continue;
    if (s1 > e1) [s1, e1] = [e1, s1];
    s1 = Math.max(WORK_START, s1);
    e1 = Math.min(WORK_END, e1);
    if (s1 >= e1) continue;
    return { start: minutesToTime(s1), end: minutesToTime(e1) };
  }
  return null;
}

function parseFlatSheet(rows, faculty) {
  if (!rows || rows.length < 2) return [];

  // Detect header row
  let headerRowIdx = 0;
  let headers = [];
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    const s = row.join(' ').toLowerCase();
    if (s.includes('room') || s.includes('قاعة') || s.includes('time') || s.includes('وقت') ||
        s.includes('course') || s.includes('مادة') || s.includes('day') || s.includes('يوم')) {
      headerRowIdx = i;
      headers = row.map(h => String(h || '').trim().toLowerCase());
      break;
    }
  }
  if (!headers.length) headers = rows[0].map(h => String(h || '').trim().toLowerCase());

  const find = (candidates) => {
    for (const h of headers) {
      for (const c of candidates) { if (h.includes(c)) return headers.indexOf(h); }
    }
    return -1;
  };

  const colMap = {
    room:        find(['room', 'قاعة', 'lab', 'مختبر', 'location', 'hall']),
    time:        find(['time', 'وقت', 'slot', 'timing']),
    day:         find(['day', 'يوم']),
    courseName:  find(['course name', 'اسم المادة', 'subject', 'مادة', 'name']),
    courseCode:  find(['code', 'كود', 'رمز']),
    lecturer:    find(['lecturer', 'instructor', 'doctor', 'prof', 'dr', 'أستاذ', 'مدرس', 'محاضر']),
    activity:    find(['activity', 'نوع', 'type', 'نشاط']),
  };

  const sessions = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => !c)) continue;

    const get = (idx) => idx >= 0 && idx < row.length ? String(row[idx] || '').trim() : '';

    const rawRoom = get(colMap.room);
    const rooms   = [...new Set(rawRoom.split(/[,،\/\\]/).map(r=>r.trim()).filter(r => isTargetLabRoom(r)))];
    if (!rooms.length) continue;

    const rawTime  = get(colMap.time);
    const rawDay   = get(colMap.day);
    const timeRange = parseTimeRange(rawTime) || parseTimeRange(rawDay);
    const days = parseDayFlat(rawDay).length ? parseDayFlat(rawDay) : parseDayFlat(rawTime);

    if (!timeRange || !days.length) continue;

    for (const room of rooms) {
      for (const day of days) {
        // Auto-detect faculty from room number
        const autoFaculty = detectFaculty(room);
        sessions.push({
          faculty:        autoFaculty,
          course_code:    get(colMap.courseCode) || null,
          course_name:    get(colMap.courseName) || null,
          section:        null,
          activity_type:  get(colMap.activity) || null,
          lecturer:       get(colMap.lecturer) || null,
          room,
          room_type:      'lab',
          day,
          start_time:     timeRange.start,
          end_time:       timeRange.end,
          duration_minutes: toMinutes(timeRange.end) - toMinutes(timeRange.start),
          capacity:       0,
          enrolled_count: 0,
          is_valid:       1,
          validation_note: null,
          raw_data_json:  JSON.stringify(row),
        });
      }
    }
  }
  return sessions;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Parse an Excel schedule file.
 * Faculty is AUTO-DETECTED from room numbers (21xx=library, 74xx/7325=it).
 * The optional `hintFaculty` param is only used as fallback when a room
 * cannot be auto-detected (should rarely be needed).
 */
function parseExcelFile(filePath, hintFaculty = 'unknown') {
  const wb = XLSX.readFile(filePath, { cellDates: false, raw: true });
  const sessions = [];
  const roomSet  = {};

  for (const sheetName of wb.SheetNames) {
    const ws   = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (rows.length < 2) continue;

    const fmt = detectSheetFormat(rows);
    let sheetSessions;

    if (fmt === 'grid') {
      sheetSessions = parseGridSheet(rows, hintFaculty);
      if (!sheetSessions) {
        sheetSessions = parseFlatSheet(rows, hintFaculty);
      }
    } else {
      sheetSessions = parseFlatSheet(rows, hintFaculty);
    }

    for (const s of sheetSessions) {
      // Override faculty with auto-detected value if possible
      if (s.room) s.faculty = detectFaculty(s.room) || s.faculty;
      if (s.faculty === 'unknown') s.faculty = hintFaculty;
      sessions.push(s);
      if (s.room && !roomSet[s.room]) {
        roomSet[s.room] = { capacity: 0, type: 'lab', faculty: s.faculty };
      }
    }
  }

  // Derive the list of distinct faculties found in this file
  const faculties = [...new Set(sessions.map(s => s.faculty).filter(f => f && f !== 'unknown'))];

  const rooms = Object.entries(roomSet).map(([name, info]) => ({
    room_name: name,
    room_type: 'lab',
    capacity:  info.capacity,
    faculty:   info.faculty,
  }));

  return { sessions, rooms, faculties, errors: [] };
}

module.exports = { parseExcelFile, toMinutes, minutesToTime, detectFaculty, DAY_LABELS: {} };
