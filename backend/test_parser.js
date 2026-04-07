/**
 * Test the Excel parser on a provided file.
 * Usage: node test_parser.js path/to/schedule.xlsx it
 */
const path = require('path');
const { parseExcelFile } = require('./services/parser');

const filePath = process.argv[2];
const faculty  = process.argv[3] || 'library';

if (!filePath) {
  console.error('Usage: node test_parser.js <path-to-excel> [faculty]');
  process.exit(1);
}

console.log(`\nParsing: ${filePath}`);
console.log(`Faculty: ${faculty}\n`);

try {
  const { sessions, rooms } = parseExcelFile(path.resolve(filePath), faculty);

  console.log(`Sessions found: ${sessions.length}`);
  console.log(`Rooms found:    ${rooms.length}`);
  console.log();

  // Group by room
  const byRoom = {};
  for (const s of sessions) {
    if (!byRoom[s.room]) byRoom[s.room] = {};
    if (!byRoom[s.room][s.day]) byRoom[s.room][s.day] = [];
    byRoom[s.room][s.day].push(`${s.start_time}–${s.end_time} | ${s.course_name || '?'} | ${s.lecturer || '?'}`);
  }

  for (const [room, days] of Object.entries(byRoom)) {
    console.log(`  ▶ Room ${room}`);
    for (const [day, entries] of Object.entries(days)) {
      console.log(`    ${day}:`);
      for (const e of entries) console.log(`      - ${e}`);
    }
    console.log();
  }
} catch (e) {
  console.error('Parse error:', e.message);
}
