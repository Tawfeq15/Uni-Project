import React, { useState, useEffect } from 'react';
import { scheduleAPI, examsAPI } from '../api';
import { useToast } from '../components/Toast';

const DAY_AR = {
  sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء', thursday: 'الخميس', friday: 'الجمعة', saturday: 'السبت',
};

const FACULTY_OPTIONS = [
  { value: '', label: 'الكل' },
  { value: 'it_library', label: 'الكل (IT + المكتبة)' },
  { value: 'it', label: 'مختبرات IT' },
  { value: 'library', label: 'مختبرات المكتبة' },
  { value: 'media', label: 'مختبرات الإعلام' },
  { value: 'arts', label: 'مختبرات الآداب' },
];

const DAYS_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export default function FinalSchedule() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ faculty: '', day: '' });
  const [roomsInfo, setRoomsInfo] = useState({});
  const toast = useToast();

  useEffect(() => {
    import('../api').then(({ roomsAPI }) => {
      roomsAPI.list().then(data => {
        const map = {};
        (data || []).forEach(r => map[r.room_name] = r);
        setRoomsInfo(map);
      });
    });
  }, []);

  useEffect(() => { load(); }, [filter]);

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (filter.faculty) params.faculty = filter.faculty;
      if (filter.day) params.day = filter.day;
      const data = await scheduleAPI.list(params);
      setExams(data.exams || []);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function deleteExam(id) {
    if (!confirm('حذف هذا الاختبار من الجدول؟')) return;
    try {
      await examsAPI.deleteScheduled(id);
      toast('تم الحذف', 'success');
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function exportExcel() {
    const params = {};
    if (filter.faculty) params.faculty = filter.faculty;
    if (filter.day) params.day = filter.day;
    scheduleAPI.exportExcel(params);
  }

  // Group by day for nice layout
  const grouped = {};
  for (const exam of exams) {
    const d = exam.day || 'other';
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(exam);
  }

  const orderedDays = DAYS_ORDER.filter(d => grouped[d]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🗓️ الجدول النهائي للاختبارات</h1>
          <p className="page-subtitle">جدول الاختبارات المؤكدة والمجدولة</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }} className="no-print">
          <button className="btn btn-primary" onClick={() => window.print()}>
            🖨️ طباعة
          </button>
          <button className="btn btn-success" onClick={exportExcel}>
            📥 تصدير Excel
          </button>
          <button className="btn btn-secondary btn-sm" onClick={load}>🔄</button>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar no-print">
        <div className="form-group">
          <label className="form-label">المبنى</label>
          <select className="form-control" value={filter.faculty} onChange={e => setFilter(f => ({ ...f, faculty: e.target.value }))}>
            {FACULTY_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">اليوم</label>
          <select className="form-control" value={filter.day} onChange={e => setFilter(f => ({ ...f, day: e.target.value }))}>
            <option value="">جميع الأيام</option>
            {DAYS_ORDER.map(d => <option key={d} value={d}>{DAY_AR[d] || d}</option>)}
          </select>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setFilter({ faculty: '', day: '' })}>✕ مسح</button>
      </div>

      {loading ? (
        <div className="spinner"></div>
      ) : exams.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📅</div>
          <h3>لا توجد اختبارات مجدولة</h3>
          <p>أضف اختبارات من صفحة "طلب اختبار جديد" وأكد جدولتها.</p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="badge badge-success">{exams.length} اختبار مجدول</span>
          </div>

          {orderedDays.map(day => (
            <div key={day} style={{ marginBottom: 24 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
              }}>
                <h2 style={{ fontSize: '1.1rem', color: 'var(--accent)' }}>
                  📅 {DAY_AR[day] || day}
                </h2>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }}></div>
                <span className="badge badge-info">{grouped[day].length} اختبار</span>
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>التاريخ</th>
                      <th>من</th>
                      <th>إلى</th>
                      <th>المدة</th>
                      <th>المبنى</th>
                      <th>كود المادة</th>
                      <th>اسم المادة</th>
                      <th>الشعبة</th>
                      <th>المحاضر</th>
                      <th>المختبرات</th>
                      <th>السعة</th>
                      <th>الطلاب</th>
                      <th>حذف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[day]
                      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
                      .map((exam, i) => (
                        <tr key={exam.id}>
                          <td className="text-muted">{i + 1}</td>
                          <td style={{ fontSize: '0.78rem' }}>{exam.exam_date || '-'}</td>
                          <td style={{ fontFamily: 'monospace', color: 'var(--success)', fontWeight: 700 }}>{exam.start_time}</td>
                          <td style={{ fontFamily: 'monospace', color: 'var(--danger)', fontWeight: 700 }}>{exam.end_time}</td>
                          <td><span className="badge badge-gray">{exam.duration_minutes}د</span></td>
                          <td><span className="badge badge-primary" style={{ fontSize: '0.68rem' }}>{exam.faculty}</span></td>
                          <td style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{exam.course_code || '-'}</td>
                          <td style={{ maxWidth: 150 }} className="truncate">{exam.course_name || '-'}</td>
                          <td>{exam.section || '-'}</td>
                          <td style={{ maxWidth: 120 }} className="truncate">{exam.lecturer || '-'}</td>
                          <td>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {(exam.rooms || []).map(r => {
                                const info = roomsInfo[r];
                                const title = [
                                  info?.vlan_id ? `VLAN: ${info.vlan_id}` : '',
                                  info?.subnet_pattern ? `Subnet: ${info.subnet_pattern}` : ''
                                ].filter(Boolean).join(' | ');
                                
                                return (
                                  <span key={r} className="badge badge-info" style={{ fontSize: '0.7rem' }} title={title || 'لا توجد تفاصيل شبكة'}>
                                    {r} {info?.vlan_id && '📡'}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td>{exam.total_capacity || '-'}</td>
                          <td>{exam.student_count || '-'}</td>
                          <td className="no-print">
                            <button className="btn btn-danger btn-sm" onClick={() => deleteExam(exam.id)}>🗑️</button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
