require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Initialize DB first
require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/availability', require('./routes/availability'));
app.use('/api/exams', require('./routes/exams'));
app.use('/api/conflicts', require('./routes/conflicts'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/schedule', require('./routes/schedule'));
app.use('/api/vision', require('./routes/vision'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'خطأ داخلي في الخادم' });
});

app.listen(PORT, () => {
  console.log(`✅ Exam Scheduler Backend running on http://localhost:${PORT}`);
});
