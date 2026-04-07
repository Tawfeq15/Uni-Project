const XLSX = require('xlsx');
const wb = XLSX.readFile('backend/uploads/1775559896666-13796275.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
console.dir(rows.slice(0, 10), { depth: null });
