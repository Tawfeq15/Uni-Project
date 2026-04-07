import React, { useState, useEffect } from 'react';
import { conflictsAPI } from '../api';
import { useToast } from '../components/Toast';

const DAY_AR = {
  sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء', thursday: 'الخميس', friday: 'الجمعة', saturday: 'السبت',
};

const TYPE_LABELS = {
  room_conflict: '🏫 تعارض قاعة',
  lecturer_conflict: '👨‍🏫 تعارض محاضر',
  lecture_overlap: '📚 تداخل محاضرة',
  capacity_issue: '🚫 مشكلة سعة',
  unscheduled: '⏳ غير مجدول',
  parse_error: '⚠️ خطأ تحليل',
};

export default function Conflicts() {
  const [conflicts, setConflicts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [filter, setFilter] = useState({ severity: '', type: '' });
  const toast = useToast();

  useEffect(() => { load(); }, [filter]);

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (filter.severity) params.severity = filter.severity;
      if (filter.type) params.type = filter.type;
      const data = await conflictsAPI.list(params);
      setConflicts(data.conflicts || []);
      setSummary(data.summary || null);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function rebuild() {
    setRebuilding(true);
    try {
      const data = await conflictsAPI.rebuild();
      toast(`تم إعادة المسح: ${data.conflicts_count} تعارض`, data.conflicts_count > 0 ? 'warning' : 'success');
      await load();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setRebuilding(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">⚠️ التعارضات والمشكلات</h1>
          <p className="page-subtitle">مراجعة تعارضات القاعات والمحاضرين ومشكلات الجدولة</p>
        </div>
        <button className="btn btn-primary" onClick={rebuild} disabled={rebuilding}>
          {rebuilding ? '⏳ جاري المسح...' : '🔄 مسح التعارضات'}
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
          <div className="stat-card danger">
            <div className="stat-icon">❌</div>
            <div className="stat-value">{summary.errors}</div>
            <div className="stat-label">أخطاء حرجة</div>
          </div>
          <div className="stat-card warning">
            <div className="stat-icon">⚠️</div>
            <div className="stat-value">{summary.warnings}</div>
            <div className="stat-label">تحذيرات</div>
          </div>
          <div className="stat-card info">
            <div className="stat-icon">📊</div>
            <div className="stat-value">{summary.total}</div>
            <div className="stat-label">إجمالي المشكلات</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="filter-bar">
        <div className="form-group">
          <label className="form-label">الخطورة</label>
          <select className="form-control" value={filter.severity} onChange={e => setFilter(f => ({ ...f, severity: e.target.value }))}>
            <option value="">الكل</option>
            <option value="error">❌ خطأ حرج</option>
            <option value="warning">⚠️ تحذير</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">نوع التعارض</label>
          <select className="form-control" value={filter.type} onChange={e => setFilter(f => ({ ...f, type: e.target.value }))}>
            <option value="">الكل</option>
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setFilter({ severity: '', type: '' })}>✕ مسح</button>
      </div>

      {loading ? (
        <div className="spinner"></div>
      ) : conflicts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✅</div>
          <h3>لا توجد تعارضات</h3>
          <p>لا توجد تعارضات أو مشكلات مكتشفة حالياً. انقر "مسح التعارضات" للتحقق من أحدث البيانات.</p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>الخطورة</th>
                <th>النوع</th>
                <th>الكلية</th>
                <th>القاعة</th>
                <th>المحاضر</th>
                <th>اليوم</th>
                <th>الوقت</th>
                <th>الرسالة</th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map((c, i) => (
                <tr key={c.id}>
                  <td className="text-muted">{i + 1}</td>
                  <td>
                    <span className={`badge badge-${c.severity === 'error' ? 'danger' : 'warning'}`}>
                      {c.severity === 'error' ? '❌ خطأ' : '⚠️ تحذير'}
                    </span>
                  </td>
                  <td>
                    <span className="badge badge-gray" style={{ fontSize: '0.7rem' }}>
                      {TYPE_LABELS[c.conflict_type] || c.conflict_type}
                    </span>
                  </td>
                  <td>{c.faculty || '-'}</td>
                  <td style={{ fontWeight: 600 }}>{c.room || '-'}</td>
                  <td>{c.lecturer || '-'}</td>
                  <td>{DAY_AR[c.day] || c.day || '-'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>
                    {c.start_time && c.end_time ? `${c.start_time} – ${c.end_time}` : '-'}
                  </td>
                  <td style={{ fontSize: '0.82rem', maxWidth: 280 }}>{c.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
