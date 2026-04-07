/**
 * Availability Engine
 * Computes available free time slots for rooms based on occupancy data
 */
const db = require('../db');
const { 
  getAllRooms, getRoomFreeSlots, isRoomFree, isLecturerFree,
  toMinutes, minutesToTime, WORK_START, WORK_END 
} = require('./occupancy');

// Day-based preferred durations
const DAY_PREFERENCES = {
  sunday:    { preferred: 60, alternate: 90 },
  tuesday:   { preferred: 60, alternate: 90 },
  thursday:  { preferred: 60, alternate: 90 },
  monday:    { preferred: 90, alternate: 60 },
  wednesday: { preferred: 90, alternate: 60 },
  saturday:  { preferred: 60, alternate: 90 },
  friday:    { preferred: 60, alternate: 90 },
};

/**
 * Get all available free room slots filtered by query params
 */
function getFreeSlots({ faculty, day, duration, minCapacity, roomType } = {}) {
  const results = [];

  const rooms = getAllRooms(faculty || null);

  const days = day ? [day] : ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];

  for (const room of rooms) {
    // Filter by type
    if (roomType && room.room_type !== roomType) continue;
    // Filter by capacity
    if (minCapacity && room.capacity < minCapacity) continue;

    for (const d of days) {
      const { occupied, free } = getRoomFreeSlots(room.room_name, d);

      for (const slot of free) {
        const slotDuration = slot.duration;
        if (duration && slotDuration < duration) continue;

        results.push({
          room: room.room_name,
          faculty: room.faculty,
          room_type: room.room_type,
          capacity: room.capacity,
          day: d,
          available_from: slot.start,
          available_to: slot.end,
          duration_minutes: slotDuration,
          occupied_before: occupied,
        });
      }
    }
  }

  return results;
}

/**
 * Suggest exam slots for a given exam request
 * Returns ranked list of suggestions
 */
function suggestExamSlots({
  faculty,
  day,
  duration,
  studentCount,
  lecturer,
  roomType = 'room',
} = {}) {
  const suggestions = [];
  const rejected = [];

  const targetDuration = duration || getDayPreferredDuration(day);
  const days = day ? [day] : ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];

  for (const d of days) {
    const preferred = DAY_PREFERENCES[d]?.preferred;
    const alternate = DAY_PREFERENCES[d]?.alternate;
    const durations = [targetDuration];
    if (preferred && !durations.includes(preferred)) durations.push(preferred);
    if (alternate && !durations.includes(alternate)) durations.push(alternate);

    for (const dur of [...new Set(durations)]) {
      const slots = generateTimeSlots(d, dur);

      for (const slot of slots) {
        const result = evaluateSlot({
          day: d,
          startMin: slot.start,
          endMin: slot.end,
          duration: dur,
          studentCount,
          lecturer,
          faculty,
          roomType,
          preferredDuration: preferred,
        });

        if (result.valid) {
          suggestions.push({ ...result, day: d });
        } else {
          rejected.push({ day: d, slot, reason: result.reason });
        }
      }
    }
  }

  // Sort suggestions by rank
  suggestions.sort((a, b) => a.rank - b.rank);

  return {
    suggestions: suggestions.slice(0, 10),
    rejected: rejected.slice(0, 5),
  };
}

/**
 * Generate candidate time slots for a day + duration
 */
function generateTimeSlots(day, duration) {
  const slots = [];
  for (let start = WORK_START; start + duration <= WORK_END; start += 30) {
    slots.push({ start, end: start + duration });
  }
  return slots;
}

/**
 * Evaluate a specific slot for scheduling validity
 * Returns { valid, rooms, totalCapacity, rank, reason }
 */
function evaluateSlot({ day, startMin, endMin, duration, studentCount, lecturer, faculty, roomType, preferredDuration }) {
  // Validate working hours
  if (startMin < WORK_START || endMin > WORK_END) {
    return { valid: false, reason: 'خارج ساعات العمل' };
  }

  // Check lecturer conflict
  if (lecturer && !isLecturerFree(lecturer, day, startMin, endMin)) {
    return { valid: false, reason: 'تعارض في جدول المحاضر' };
  }

  // Find available rooms
  const allRooms = getAllRooms(faculty || null);
  const availableRooms = allRooms.filter(r => {
    if (roomType && r.room_type !== roomType) return false;
    return isRoomFree(r.room_name, day, startMin, endMin);
  }).sort((a, b) => b.capacity - a.capacity);

  if (availableRooms.length === 0) {
    return { valid: false, reason: 'لا توجد قاعات متاحة في هذا الوقت' };
  }

  // Find minimum room combination to satisfy studentCount
  let selectedRooms = [];
  let totalCapacity = 0;
  const needed = studentCount || 0;

  if (needed > 0) {
    // Try single room first
    const singleRoom = availableRooms.find(r => r.capacity >= needed);
    if (singleRoom) {
      selectedRooms = [singleRoom];
      totalCapacity = singleRoom.capacity;
    } else {
      // Combine rooms
      for (const room of availableRooms) {
        selectedRooms.push(room);
        totalCapacity += room.capacity;
        if (totalCapacity >= needed) break;
      }
      if (totalCapacity < needed) {
        return { valid: false, reason: `سعة القاعات غير كافية (مطلوب ${needed}، متوفر ${totalCapacity})` };
      }
    }
  } else {
    selectedRooms = [availableRooms[0]];
    totalCapacity = availableRooms[0].capacity;
  }

  // Rank scoring (lower = better)
  let rank = 0;
  if (duration !== preferredDuration) rank += 2; // Prefer matching day pattern
  rank += selectedRooms.length * 3; // Prefer fewer rooms
  rank += Math.max(0, totalCapacity - needed) / 10; // Minimize wasted seats

  return {
    valid: true,
    start_time: minutesToTime(startMin),
    end_time: minutesToTime(endMin),
    duration_minutes: duration,
    rooms: selectedRooms.map(r => r.room_name),
    rooms_detail: selectedRooms,
    total_capacity: totalCapacity,
    room_type: roomType,
    rank,
    is_preferred_duration: duration === preferredDuration,
  };
}

function getDayPreferredDuration(day) {
  return DAY_PREFERENCES[day]?.preferred || 60;
}

module.exports = { getFreeSlots, suggestExamSlots, DAY_PREFERENCES };
