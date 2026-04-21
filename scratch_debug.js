const { parseExcelFile, toMinutes, minutesToTime, detectFaculty } = require('./backend/services/parser');

function parseTimeRange(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  // Find all time patterns hh:mm or hh.mm globally
  // (13:00_14:30 , ح وجاهي, ث وجاهي)
  const times = [...s.matchAll(/\b(\d{1,2})[:.](\d{2})\b/g)];
  console.log('regex times:', times.map(m => m[0]));
  if (times.length < 2) return null;

  let t1 = parseInt(times[0][1]) * 60 + parseInt(times[0][2]);
  let t2 = parseInt(times[1][1]) * 60 + parseInt(times[1][2]);

  console.log(t1, t2);
}

parseTimeRange("(13:00_14:30 , ح وجاهي, ث وجاهي)");
parseTimeRange("13:00");
parseTimeRange("09:30_10:30");

const parser = require('./backend/services/parser');
const XLSX = require('xlsx');
const path = require('path');
const wb = XLSX.utils.book_new();
const ws_data = [
  ['المقرر', 'ش', 'السعة', 'العدد', 'النشاط', 'القاعة', 'الوقت', 'المحاضر'],
  ['مقدمة في البرمجة', '1', '35', '30', 'وجاهي', '2107, 2107', '(13:00_14:30 , ح وجاهي, ث وجاهي)', 'د. محمد'],
  ['تاريخ حضارة', '1', '50', '45', 'غير متزامن', 'A24323', 'خ غير متزامن', 'أ. علي'],
];
const ws = XLSX.utils.aoa_to_sheet(ws_data);
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
XLSX.writeFile(wb, 'debug.xlsx');

const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
console.log('headers norm:', rows[0].map(s => {
  return String(s || '').trim().replace(/\u00A0/g, ' ').replace(/[أإآ]/g, 'ا').toLowerCase();
}));
