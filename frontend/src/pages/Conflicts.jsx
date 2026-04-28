import React, { useState, useEffect } from 'react';
import { conflictsAPI, importConflictsAPI } from '../api';
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
  const [activeTab, setActiveTab] = useState('import'); // 'system' or 'import'
  const [conflicts, setConflicts] = useState([]);
  const [summary, setSummary] = useState(null);
  
  // Import Conflicts state
  const [importGroups, setImportGroups] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [filter, setFilter] = useState({ severity: '', type: '' });
  const [rescheduleData, setRescheduleData] = useState(null); // { groupId, itemId, date, start, end, rooms }
  
  const toast = useToast();

  useEffect(() => { load(); }, [filter, activeTab]);

  async function load() {
    setLoading(true);
    try {
      if (activeTab === 'system') {
        const params = {};
        if (filter.severity) params.severity = filter.severity;
        if (filter.type) params.type = filter.type;
        const data = await conflictsAPI.list(params);
        setConflicts(data.conflicts || []);
        setSummary(data.summary || null);
      } else {
        const data = await importConflictsAPI.getGroups();
        setImportGroups(data.groups || []);
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function rebuild() {
    if (activeTab === 'import') return load();
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

  // Import Workflow Actions
  async function handleApprove(groupId, itemId) {
    if (!confirm('سيتم اعتماد هذه المادة كخيار صحيح، وسيتم إجبار المواد الأخرى في هذا التعارض على إعادة الجدولة. هل أنت متأكد؟')) return;
    try {
      const res = await importConflictsAPI.approveItem(groupId, itemId);
      toast(res.message, 'success');
      load();
    } catch(e) {
      toast(e.message, 'error');
    }
  }

  async function handleReject(groupId, itemId) {
    if (!confirm('سيتم رفض هذه المادة وإلغاء استيرادها. هل أنت متأكد؟')) return;
    try {
      const res = await importConflictsAPI.rejectItem(groupId, itemId);
      toast(res.message, 'success');
      load();
    } catch(e) {
      toast(e.message, 'error');
    }
  }

  async function handleRescheduleSubmit() {
    try {
      const payload = {
        exam_date: rescheduleData.date,
        start_time: rescheduleData.start,
        end_time: rescheduleData.end,
        rooms: rescheduleData.rooms.split(',').map(r => r.trim()).filter(Boolean),
        notes: rescheduleData.notes
      };
      const res = await importConflictsAPI.rescheduleItem(rescheduleData.groupId, rescheduleData.itemId, payload);
      toast(res.message, 'success');
      setRescheduleData(null);
      load();
    } catch(e) {
      toast(e.message, 'error');
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">⚠️ التعارضات والمشكلات</h1>
          <p className="page-subtitle">مراجعة تعارضات الاستيراد ومشكلات الجدولة</p>
        </div>
        {activeTab === 'system' && (
          <button className="btn btn-primary" onClick={rebuild} disabled={rebuilding}>
            {rebuilding ? '⏳ جاري المسح...' : '🔄 مسح التعارضات'}
          </button>
        )}
        {activeTab === 'import' && (
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            🔄 تحديث
          </button>
        )}
      </div>

      <div className="tabs" style={{ marginBottom: 20 }}>
        <button className={`tab ${activeTab === 'import' ? 'active' : ''}`} onClick={() => setActiveTab('import')}>
          📥 تعارضات الاستيراد (سير العمل)
        </button>
        <button className={`tab ${activeTab === 'system' ? 'active' : ''}`} onClick={() => setActiveTab('system')}>
          ⚙️ تعارضات النظام
        </button>
      </div>

      {activeTab === 'system' && (
        <>
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
        </>
      )}

      {activeTab === 'import' && (
        <>
          {loading ? (
            <div className="spinner"></div>
          ) : importGroups.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <h3>لا توجد تعارضات استيراد</h3>
              <p>جميع عمليات الاستيراد السابقة تمت بنجاح وبدون تعارضات معلقة.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {importGroups.map(group => (
                <div key={group.id} className="card" style={{ borderLeft: `4px solid ${group.status === 'resolved' ? 'var(--success)' : 'var(--danger)'}` }}>
                  <div className="card-header" style={{ paddingBottom: 10 }}>
                    <div>
                      <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {group.title}
                        <span className={`badge ${group.status === 'resolved' ? 'badge-success' : (group.status === 'open' ? 'badge-danger' : 'badge-warning')}`}>
                          {group.status === 'resolved' ? 'محلول' : (group.status === 'open' ? 'مفتوح' : 'قيد الحل')}
                        </span>
                      </h3>
                      <div style={{ marginTop: 10 }}>
                        {(group.description || '').split('|').map((desc, i) => (
                          <div key={i} style={{ 
                            background: 'rgba(239, 68, 68, 0.1)', 
                            borderRight: '3px solid var(--danger)',
                            padding: '6px 12px',
                            marginBottom: 4,
                            borderRadius: 4,
                            fontSize: '0.85rem',
                            color: 'var(--text-primary)'
                          }}>
                            ⚠️ {desc.trim()}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table style={{ margin: 0, borderTop: 'none' }}>
                      <thead style={{ background: 'var(--bg-lighter)' }}>
                        <tr>
                          <th>المادة</th>
                          <th>الوقت/التاريخ</th>
                          <th>القاعات</th>
                          <th>الحالة</th>
                          <th style={{ width: 250 }}>إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items?.map(item => (
                          <tr key={item.id} style={{ opacity: ['approved', 'rejected', 'rescheduled'].includes(item.action_status) ? 0.6 : 1 }}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{item.course_code}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.course_name} (ش {item.section_number})</div>
                            </td>
                            <td>
                              <div style={{ fontSize: '0.85rem' }}>{item.exam_date}</div>
                              <div style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{item.start_time} - {item.end_time}</div>
                            </td>
                            <td>{JSON.parse(item.room_names || '[]').join('، ')}</td>
                            <td>
                              <span className={`badge ${
                                item.action_status === 'approved' ? 'badge-success' :
                                item.action_status === 'rejected' ? 'badge-danger' :
                                item.action_status === 'rescheduled' ? 'badge-primary' :
                                item.action_status === 'needs_reschedule' ? 'badge-warning' : 'badge-gray'
                              }`}>
                                {item.action_status === 'approved' ? 'تم الاعتماد' :
                                 item.action_status === 'rejected' ? 'مرفوض' :
                                 item.action_status === 'rescheduled' ? 'أعيدت جدولته' :
                                 item.action_status === 'needs_reschedule' ? 'يحتاج إعادة جدولة' : 'قيد المراجعة'}
                              </span>
                            </td>
                            <td>
                              {['pending_review', 'needs_reschedule'].includes(item.action_status) && (
                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                  {item.action_status === 'pending_review' && (
                                    <>
                                      <button className="btn btn-success btn-sm" onClick={() => handleApprove(group.id, item.id)}>اعتماد</button>
                                      <button className="btn btn-danger btn-sm" onClick={() => handleReject(group.id, item.id)}>رفض</button>
                                    </>
                                  )}
                                  <button className="btn btn-primary btn-sm" onClick={() => setRescheduleData({
                                    groupId: group.id, itemId: item.id,
                                    date: item.exam_date || '', start: item.start_time || '', end: item.end_time || '',
                                    rooms: JSON.parse(item.room_names || '[]').join(', '), notes: ''
                                  })}>إعادة جدولة</button>
                                </div>
                              )}
                              {item.resolution_note && <div style={{ fontSize: '0.7rem', marginTop: 5, color: 'var(--text-muted)' }}>ملاحظة: {item.resolution_note}</div>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {rescheduleData && (
        <div className="modal-overlay" onClick={() => setRescheduleData(null)}>
          <div className="modal-content" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>إعادة جدولة المادة</h2>
              <button className="modal-close" onClick={() => setRescheduleData(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">تاريخ الاختبار الجديد</label>
                <input type="date" className="form-control" value={rescheduleData.date} onChange={e => setRescheduleData(d => ({...d, date: e.target.value}))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">وقت البداية</label>
                  <input type="time" className="form-control" value={rescheduleData.start} onChange={e => setRescheduleData(d => ({...d, start: e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">وقت النهاية</label>
                  <input type="time" className="form-control" value={rescheduleData.end} onChange={e => setRescheduleData(d => ({...d, end: e.target.value}))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">القاعات (مفصولة بفاصلة)</label>
                <input type="text" className="form-control" value={rescheduleData.rooms} onChange={e => setRescheduleData(d => ({...d, rooms: e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">ملاحظات الحل</label>
                <textarea className="form-control" value={rescheduleData.notes} onChange={e => setRescheduleData(d => ({...d, notes: e.target.value}))}></textarea>
              </div>
              
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button className="btn btn-primary" onClick={handleRescheduleSubmit}>حفظ وجدولة</button>
                <button className="btn btn-secondary" onClick={() => setRescheduleData(null)}>إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
