import React, { useState, useEffect } from 'react';
import { sessionsAPI } from '../api';
import { useToast } from '../components/Toast';

const DAY_AR = {
  sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء', thursday: 'الخميس', friday: 'الجمعة', saturday: 'السبت',
};

const FACULTY_OPTIONS = [
  { value: '', label: 'الكل (IT + المكتبة)' },
  { value: 'it', label: 'مبنى IT' },
  { value: 'library', label: 'مبنى المكتبة' },
];

export default function Sessions() {
  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ faculty: '', day: '', room: '', lecturer: '', room_type: '' });
  const [filterOptions, setFilterOptions] = useState({ faculties: [], days: [], rooms: [], lecturers: [] });
  const [page, setPage] = useState(1);
  const toast = useToast();
  const LIMIT = 50;

  useEffect(() => {
    sessionsAPI.filters().then(setFilterOptions).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [filters, page]);

  async function load() {
    setLoading(true);
    try {
      const params = { page, limit: LIMIT };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const data = await sessionsAPI.list(params);
      setSessions(data.sessions || []);
      setTotal(data.total || 0);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function setFilter(key, val) {
    setFilters(prev => ({ ...prev, [key]: val }));
    setPage(1);
  }

  function handleFilterChange(e) {
    setFilter(e.target.name, e.target.value);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">📋 جلسات المحاضرات</h1>
          <p className="page-subtitle">البيانات المحللة من ملفات جداول المحاضرات المرفوعة</p>
        </div>
        <div className="flex gap-2 items-center">
          <span className="badge badge-info">{total} جلسة</span>
          <button className="btn btn-secondary btn-sm" onClick={load}>🔄</button>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="form-group">
          <label className="form-label">المبنى</label>
          <select className="form-control" name="faculty" value={filters.faculty} onChange={handleFilterChange}>
            {FACULTY_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">اليوم</label>
          <select className="form-control" value={filters.day} onChange={e => setFilter('day', e.target.value)}>
            <option value="">الكل</option>
            {filterOptions.days.map(d => <option key={d} value={d}>{DAY_AR[d] || d}</option>)}
          </select>
        </div>
        <div className="form-group" style={{display: 'none'}}>
          <label className="form-label">نوع القاعة</label>
          <select className="form-control" value={filters.room_type} onChange={e => setFilter('room_type', e.target.value)}>
            <option value="">الكل</option>
            <option value="room">قاعة دراسية</option>
            <option value="lab">مختبر محوسب</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">القاعة</label>
          <input
            type="text"
            className="form-control"
            placeholder="بحث..."
            value={filters.room}
            onChange={e => setFilter('room', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">المحاضر</label>
          <input
            type="text"
            className="form-control"
            placeholder="بحث..."
            value={filters.lecturer}
            onChange={e => setFilter('lecturer', e.target.value)}
          />
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => { setFilters({ faculty: '', day: '', room: '', lecturer: '', room_type: '' }); setPage(1); }}>
          ✕ مسح
        </button>
      </div>

      <div className="table-container">
        {loading ? (
          <div className="spinner"></div>
        ) : sessions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <h3>لا توجد جلسات</h3>
            <p>
              {Object.values(filters).some(v => v)
                ? 'لم يتم العثور على جلسات بهذه الفلاتر. جرب تغيير الفلاتر.'
                : 'ارفع ملف جدول محاضرات من صفحة "رفع الملفات" أولاً.'}
            </p>
          </div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>المبنى</th>
                  <th>المختبر</th>
                  <th>اسم المادة</th>
                  <th>المحاضر</th>
                  <th>اليوم</th>
                  <th>البداية</th>
                  <th>النهاية</th>
                  <th>المدة</th>
                  <th>الملف</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id}>
                    <td><span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>{s.faculty}</span></td>
                    <td>
                      {s.room_id ? (
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.room} <span title="قاعة معروفة" style={{fontSize:'0.7rem'}}>✅</span></span>
                      ) : (
                        <span style={{ fontWeight: 600, color: 'var(--danger)' }} title="لم يتم التعرف على القاعة">{s.room_raw || s.room} ⚠️</span>
                      )}
                    </td>
                    <td style={{ maxWidth: 180 }} className="truncate">{(s.course_code ? s.course_code + ' - ' : '') + (s.course_name || '-')}</td>
                    <td style={{ maxWidth: 140 }} className="truncate">{s.lecturer || '-'}</td>
                    <td>{DAY_AR[s.day] || s.day}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--success)' }}>{s.start_time || '-'}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--danger)' }}>{s.end_time || '-'}</td>
                    <td className="text-muted">{s.duration_minutes ? `${s.duration_minutes}د` : '-'}</td>
                    <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: 100 }} className="truncate">
                      {s.source_file || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {total > LIMIT && (
              <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  ← السابق
                </button>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  صفحة {page} من {Math.ceil(total / LIMIT)}
                </span>
                <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(total / LIMIT)} onClick={() => setPage(p => p + 1)}>
                  التالي →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
