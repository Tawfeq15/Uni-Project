/**
 * Seed all lab rooms with correct capacities
 * Run: node seed_rooms.js
 */
const db = require('./db');

const labs = [
  // Library building (21xx)
  { name: '2101', capacity: 26, faculty: 'library' },
  { name: '2102', capacity: 26, faculty: 'library' },
  { name: '2103', capacity: 26, faculty: 'library' },
  { name: '2104', capacity: 26, faculty: 'library' },
  { name: '2105', capacity: 26, faculty: 'library' },
  { name: '2106', capacity: 26, faculty: 'library' },
  { name: '2107', capacity: 35, faculty: 'library' },
  // IT building (74xx)
  { name: '7416', capacity: 24, faculty: 'it' },
  { name: '7417', capacity: 20, faculty: 'it' },
  { name: '7418', capacity: 18, faculty: 'it' },
  { name: '7419', capacity: 26, faculty: 'it' },
  { name: '7420', capacity: 26, faculty: 'it' },
  { name: '7422', capacity: 26, faculty: 'it' },
  { name: '7424', capacity: 26, faculty: 'it' },
  { name: '7426', capacity: 26, faculty: 'it' },
  { name: '7428', capacity: 26, faculty: 'it' },
  // Special exception
  { name: '7325', capacity: 24, faculty: 'it' },
];

const upsert = db.prepare(`
  INSERT INTO rooms (faculty, room_name, room_type, capacity, is_active)
  VALUES (?, ?, 'lab', ?, 1)
  ON CONFLICT(room_name, faculty) DO UPDATE SET capacity = excluded.capacity, room_type = 'lab', is_active = 1
`);

const tx = db.transaction(() => {
  for (const lab of labs) {
    upsert.run(lab.faculty, lab.name, lab.capacity);
    console.log(`  ✅ ${lab.name} (${lab.faculty}) - سعة ${lab.capacity}`);
  }
});
tx();

const all = db.prepare('SELECT room_name, faculty, room_type, capacity FROM rooms ORDER BY room_name').all();
console.log('\n📋 All rooms in DB:');
all.forEach(r => console.log(`  ${r.room_name} | ${r.faculty} | ${r.room_type} | ${r.capacity}`));
console.log(`\nTotal: ${all.length} rooms`);
