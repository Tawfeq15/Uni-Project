const API_BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `خطأ ${res.status}`);
  return data;
}

// Uploads
export const uploadsAPI = {
  upload: (formData) =>
    fetch(`${API_BASE}/uploads`, { method: 'POST', body: formData })
      .then(r => r.json()),
  list: () => request('/uploads'),
  delete: (id) => request(`/uploads/${id}`, { method: 'DELETE' }),
  reparse: (id) => request(`/uploads/${id}/reparse`, { method: 'POST' }),
};

// Rooms
export const roomsAPI = {
  list: (faculty) => request(`/rooms${faculty ? '?faculty=' + encodeURIComponent(faculty) : ''}`),
  create: (data) => request('/rooms', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/rooms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/rooms/${id}`, { method: 'DELETE' }),
};

// Sessions
export const sessionsAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/sessions${q ? '?' + q : ''}`);
  },
  filters: () => request('/sessions/filters'),
};

// Availability
export const availabilityAPI = {
  freeSlots: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/availability/free-slots${q ? '?' + q : ''}`);
  },
  rooms: (faculty) => request(`/availability/rooms${faculty ? '?faculty=' + encodeURIComponent(faculty) : ''}`),
  roomDay: (room, day) => request(`/availability/room/${encodeURIComponent(room)}/day/${day}`),
  summary: (faculty) => request(`/availability/summary${faculty ? '?faculty=' + encodeURIComponent(faculty) : ''}`),
};

// Exams
export const examsAPI = {
  createRequest: (data) => request('/exams/requests', { method: 'POST', body: JSON.stringify(data) }),
  listRequests: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/exams/requests${q ? '?' + q : ''}`);
  },
  deleteRequest: (id) => request(`/exams/requests/${id}`, { method: 'DELETE' }),
  suggestSlot: (data) => request('/exams/suggest-slot', { method: 'POST', body: JSON.stringify(data) }),
  schedule: (data) => request('/exams/schedule', { method: 'POST', body: JSON.stringify(data) }),
  listScheduled: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/exams/scheduled${q ? '?' + q : ''}`);
  },
  deleteScheduled: (id) => request(`/exams/scheduled/${id}`, { method: 'DELETE' }),
};

// Conflicts
export const conflictsAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/conflicts${q ? '?' + q : ''}`);
  },
  rebuild: () => request('/conflicts/rebuild', { method: 'POST' }),
};

// Dashboard
export const dashboardAPI = {
  stats: () => request('/dashboard/stats'),
  reset: () => request('/dashboard/reset', { method: 'POST' }),
};

// Schedule
export const scheduleAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/schedule${q ? '?' + q : ''}`);
  },
  exportExcel: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    window.open(`${API_BASE}/schedule/export/excel${q ? '?' + q : ''}`, '_blank');
  },
};
