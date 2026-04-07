const express = require('express');
const router = express.Router();
const db = require('../db');
const { getFreeSlots } = require('../services/availability');
const { getRoomFreeSlots, getAllRooms } = require('../services/occupancy');

// GET /availability/free-slots
router.get('/free-slots', (req, res) => {
  try {
    const { faculty, day, duration, studentCount, roomType } = req.query;

    const slots = getFreeSlots({
      faculty: faculty || null,
      day: day || null,
      duration: duration ? parseInt(duration) : null,
      minCapacity: studentCount ? parseInt(studentCount) : null,
      roomType: roomType || null,
    });

    res.json({ slots, count: slots.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /availability/rooms
router.get('/rooms', (req, res) => {
  try {
    const { faculty } = req.query;
    const rooms = getAllRooms(faculty || null);
    res.json({ rooms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /availability/room/:room/day/:day
router.get('/room/:room/day/:day', (req, res) => {
  try {
    const { room, day } = req.params;
    const result = getRoomFreeSlots(room, day);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /availability/summary
router.get('/summary', (req, res) => {
  try {
    const { faculty } = req.query;
    
    const rooms = getAllRooms(faculty || null);
    const totalRooms = rooms.filter(r => r.room_type === 'room').length;
    const totalLabs = rooms.filter(r => r.room_type === 'lab').length;

    // Check which rooms have any free slots today
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    let freeRooms = 0;
    let freeLabs = 0;

    for (const room of rooms) {
      const { free } = getRoomFreeSlots(room.room_name, today);
      if (free.length > 0) {
        if (room.room_type === 'lab') freeLabs++;
        else freeRooms++;
      }
    }

    res.json({
      total_rooms: totalRooms,
      total_labs: totalLabs,
      free_rooms: freeRooms,
      free_labs: freeLabs,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
