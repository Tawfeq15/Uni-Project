import { OPERATOR } from './config/operator';

const API_BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 422 && data.conflicts) {
      const err = new Error(data.message || 'تعارض في الجدولة');
      err.isConflict = true;
      err.conflicts  = data.conflicts;
      throw err;
    }
    if (res.status === 409) {
      const err = new Error(data.message || 'تعارض في الوقت الفعلي');
      if (data.conflicts) {
        err.isConflict = true;
        err.conflicts  = data.conflicts;
      }
      if (data.requires_replacement_confirmation) {
        err.requires_replacement_confirmation = true;
        err.duplicate = data.duplicate;
      }
      throw err;
    }
    throw new Error(data.error || data.message || `خطأ ${res.status}`);
  }

  return data;
}

/** Inject operator fields into a JSON body object */
function withOperator(body = {}) {
  return { ...body, operator_name: OPERATOR.name, operator_role: OPERATOR.role };
}

// ── Uploads ──────────────────────────────────────────────────────────────────
export const uploadsAPI = {
  upload:  (formData) => fetch(`${API_BASE}/uploads`, { method: 'POST', body: formData }).then(r => r.json()),
  list:    () => request('/uploads'),
  delete:  (id) => request(`/uploads/${id}`, { method: 'DELETE' }),
  reparse: (id) => request(`/uploads/${id}/reparse`, { method: 'POST' }),
};

// ── Rooms ─────────────────────────────────────────────────────────────────────
export const roomsAPI = {
  list:   (faculty) => request(`/rooms${faculty ? '?faculty=' + encodeURIComponent(faculty) : ''}`),
  create: (data) => request('/rooms', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/rooms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/rooms/${id}`, { method: 'DELETE' }),
};

// ── Courses ───────────────────────────────────────────────────────────────────
export const coursesAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/courses${q ? '?' + q : ''}`);
  },
  getSections: (courseCode) => request(`/courses/${encodeURIComponent(courseCode)}/sections`),
};

// ── Sessions ──────────────────────────────────────────────────────────────────
export const sessionsAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/sessions${q ? '?' + q : ''}`);
  },
  filters: () => request('/sessions/filters'),
};

// ── Availability ──────────────────────────────────────────────────────────────
export const availabilityAPI = {
  freeSlots: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/availability/free-slots${q ? '?' + q : ''}`);
  },
  rooms:   (faculty) => request(`/availability/rooms${faculty ? '?faculty=' + encodeURIComponent(faculty) : ''}`),
  roomDay: (room, day) => request(`/availability/room/${encodeURIComponent(room)}/day/${day}`),
  summary: (faculty) => request(`/availability/summary${faculty ? '?faculty=' + encodeURIComponent(faculty) : ''}`),
};

// ── Exams ─────────────────────────────────────────────────────────────────────
export const examsAPI = {
  createRequest: (data) => request('/exams/requests', { method: 'POST', body: JSON.stringify(withOperator(data)) }),
  listRequests:  (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/exams/requests${q ? '?' + q : ''}`);
  },
  showRequest:    (id) => request(`/exams/requests/${id}`),
  deleteRequest:  (id) => request(`/exams/requests/${id}`, { method: 'DELETE' }),

  // Approval workflow
  submitRequest:  (id) => request(`/exams/requests/${id}/submit`,  { method: 'POST', body: JSON.stringify(withOperator({})) }),
  approveRequest: (id, comment = 'موافق') => request(`/exams/requests/${id}/approve`, { method: 'POST', body: JSON.stringify(withOperator({ comment })) }),
  rejectRequest:  (id, comment) => request(`/exams/requests/${id}/reject`,  { method: 'POST', body: JSON.stringify(withOperator({ comment })) }),
  cancelRequest:  (id, comment = 'ملغى') => request(`/exams/requests/${id}/cancel`,  { method: 'POST', body: JSON.stringify(withOperator({ comment })) }),
  getApprovals:   (id) => request(`/exams/requests/${id}/approvals`),

  suggestSlot:    (data) => request('/exams/suggest-slot', { method: 'POST', body: JSON.stringify(data) }),
  schedule:       (data) => request('/exams/schedule', { method: 'POST', body: JSON.stringify(withOperator(data)) }),

  listScheduled:  (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/exams/scheduled${q ? '?' + q : ''}`);
  },
  showScheduled:  (id) => request(`/exams/scheduled/${id}`),
  deleteScheduled:(id) => request(`/exams/scheduled/${id}`, { method: 'DELETE', body: JSON.stringify(withOperator({})) }),
};

// ── Exam Schedule Imports (From Other Faculties) ──────────────
export const examImportsAPI = {
  preview: (formData) => fetch(`${API_BASE}/exams/import/preview`, { method: 'POST', body: formData }).then(r => r.json()),
  confirm: (data) => request('/exams/import/confirm', { method: 'POST', body: JSON.stringify(withOperator(data)) }),
  list:    () => request('/exams/imports'),
  show:    (id) => request(`/exams/imports/${id}`),
  delete:  (id) => request(`/exams/imports/${id}`, { method: 'DELETE' }),
};

// ── Conflicts ─────────────────────────────────────────────────────────────────
export const conflictsAPI = {
  list:    (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/conflicts${q ? '?' + q : ''}`);
  },
  rebuild: () => request('/conflicts/rebuild', { method: 'POST' }),
};

// ── Import Workflow Conflicts ──────────────────────────────────────────────────
export const importConflictsAPI = {
  getGroups: () => request('/exams/import/conflicts'),
  approveItem: (groupId, itemId) => request(`/conflicts/groups/${groupId}/items/${itemId}/approve`, { method: 'POST', body: JSON.stringify(withOperator({})) }),
  rejectItem: (groupId, itemId) => request(`/conflicts/groups/${groupId}/items/${itemId}/reject`, { method: 'POST', body: JSON.stringify(withOperator({})) }),
  rescheduleItem: (groupId, itemId, data) => request(`/conflicts/groups/${groupId}/items/${itemId}/reschedule`, { method: 'POST', body: JSON.stringify(withOperator(data)) }),
  ignoreWarning: (groupId) => request(`/conflicts/groups/${groupId}/ignore-warning`, { method: 'POST', body: JSON.stringify(withOperator({})) }),
};

// ── Blackout Dates ────────────────────────────────────────────────────────────
export const blackoutDatesAPI = {
  list:   () => request('/blackout-dates'),
  create: (data) => request('/blackout-dates', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id) => request(`/blackout-dates/${id}`, { method: 'DELETE' }),
  check:  (date) => request(`/blackout-dates/check?date=${date}`),
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const dashboardAPI = {
  stats: () => request('/dashboard/stats'),
  reset: () => request('/dashboard/reset', { method: 'POST' }),
};

// ── Schedule ──────────────────────────────────────────────────────────────────
export const scheduleAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/schedule${q ? '?' + q : ''}`);
  },
  clear: () => request('/schedule', { method: 'DELETE' }),
  exportExcel: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    window.open(`${API_BASE}/schedule/export/excel${q ? '?' + q : ''}`, '_blank');
  },
  exportPdf: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    window.open(`${API_BASE}/schedule/export/pdf${q ? '?' + q : ''}`, '_blank');
  },
};

// ── Conflict Error Formatter ──────────────────────────────────────────────────
export function formatConflictErrors(err) {
  if (!err.isConflict || !err.conflicts?.length) return err.message;

  const typeLabels = {
    room_conflict:         '🏢 تعارض في القاعة',
    lecture_conflict:      '📚 تعارض مع محاضرة',
    instructor_conflict:   '👨‍🏫 تعارض في جدول المحاضر',
    section_conflict:      '👥 تعارض في الشعبة',
    capacity_conflict:     '⚠️ السعة غير كافية',
    blackout_date:         '🚫 تاريخ محظور',
    outside_working_hours: '⏰ خارج ساعات الدوام',
    invalid_time:          '❌ وقت غير صالح',
  };

  const lines = err.conflicts.map(c => {
    const label = typeLabels[c.type] || c.type;
    return `${label}: ${c.message}`;
  });

  return `${err.message}\n\n${lines.join('\n')}`;
}
