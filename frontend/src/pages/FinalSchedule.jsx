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
  const [filter, setFilter] = useState({ 
    faculty: '', day: '', date_from: '', date_to: '', course_code: '', 
    room: '', lecturer: '', include_cancelled: false, include_replaced: false 
  });
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
      if (filter.date_from) params.date_from = filter.date_from;
      if (filter.date_to) params.date_to = filter.date_to;
      if (filter.course_code) params.course_code = filter.course_code;
      if (filter.room) params.room = filter.room;
      if (filter.lecturer) params.lecturer = filter.lecturer;
      if (filter.include_cancelled) params.include_cancelled = true;
      if (filter.include_replaced) params.include_replaced = true;
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
    const params = { ...filter };
    scheduleAPI.exportExcel(params);
  }

  function exportPdf() {
    const params = { ...filter };
    scheduleAPI.exportPdf(params);
  }

  async function clearSchedule() {
    if (!confirm('⚠️ تحذير: سيتم حذف كافة الاختبارات المجدولة وتفريغ الجدول بالكامل! هل أنت متأكد؟')) return;
    try {
      const res = await scheduleAPI.clear();
      toast(res.message, 'success');
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function formatDisplayDate(d) {
    if (!d || !d.includes('-')) return d;
    const [y, m, day] = d.split('-');
    return `${day}-${m}-${y}`;
  }

  // Group by date explicitly
  const grouped = {};
  for (const exam of exams) {
    let k = exam.exam_date ? exam.exam_date : 'تاريخ غير محدد - يحتاج تصحيح';
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(exam);
  }

  // Sort groups: valid dates first, then 'other'
  const orderedGroups = Object.keys(grouped).sort((a, b) => {
    const isDateA = a.includes('-') && !a.includes('تاريخ');
    const isDateB = b.includes('-') && !b.includes('تاريخ');
    if (isDateA && isDateB) {
      return new Date(a).getTime() - new Date(b).getTime();
    }
    if (isDateA) return -1;
    if (isDateB) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🗓️ الجدول النهائي للاختبارات</h1>
          <p className="page-subtitle">جدول الاختبارات المؤكدة والمجدولة</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} className="no-print">
          <button className="btn btn-danger" onClick={clearSchedule}>
            🗑️ تفريغ الجدول
          </button>
          <button className="btn btn-primary" onClick={() => window.print()}>
            🖨️ طباعة
          </button>
          <button className="btn btn-success" onClick={exportExcel}>
            📥 تصدير Excel
          </button>
          <button className="btn btn-secondary" onClick={exportPdf}>
            📄 تصدير PDF
          </button>
          <button className="btn btn-secondary btn-sm" onClick={load}>🔄</button>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 15 }}>
        <div className="form-group" style={{ minWidth: 150 }}>
          <label className="form-label">المبنى</label>
          <select className="form-control" value={filter.faculty} onChange={e => setFilter(f => ({ ...f, faculty: e.target.value }))}>
            {FACULTY_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ minWidth: 120 }}>
          <label className="form-label">اليوم</label>
          <select className="form-control" value={filter.day} onChange={e => setFilter(f => ({ ...f, day: e.target.value }))}>
            <option value="">الكل</option>
            {DAYS_ORDER.map(d => <option key={d} value={d}>{DAY_AR[d] || d}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ minWidth: 120 }}>
          <label className="form-label">التاريخ من</label>
          <input type="date" className="form-control" value={filter.date_from} onChange={e => setFilter(f => ({ ...f, date_from: e.target.value }))} />
        </div>
        <div className="form-group" style={{ minWidth: 120 }}>
          <label className="form-label">التاريخ إلى</label>
          <input type="date" className="form-control" value={filter.date_to} onChange={e => setFilter(f => ({ ...f, date_to: e.target.value }))} />
        </div>
        <div className="form-group" style={{ minWidth: 100 }}>
          <label className="form-label">رمز المادة</label>
          <input type="text" className="form-control" value={filter.course_code} onChange={e => setFilter(f => ({ ...f, course_code: e.target.value }))} />
        </div>
        <div className="form-group" style={{ minWidth: 100 }}>
          <label className="form-label">القاعة</label>
          <input type="text" className="form-control" value={filter.room} onChange={e => setFilter(f => ({ ...f, room: e.target.value }))} />
        </div>
        <div className="form-group" style={{ minWidth: 100 }}>
          <label className="form-label">المحاضر</label>
          <input type="text" className="form-control" value={filter.lecturer} onChange={e => setFilter(f => ({ ...f, lecturer: e.target.value }))} />
        </div>
        <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8, gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.85rem' }}>
            <input type="checkbox" checked={filter.include_cancelled} onChange={e => setFilter(f => ({ ...f, include_cancelled: e.target.checked }))} />
            إظهار الملغي
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.85rem' }}>
            <input type="checkbox" checked={filter.include_replaced} onChange={e => setFilter(f => ({ ...f, include_replaced: e.target.checked }))} />
            إظهار المستبدل
          </label>
        </div>
        <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setFilter({ faculty: '', day: '', date_from: '', date_to: '', course_code: '', room: '', lecturer: '', include_cancelled: false, include_replaced: false })}>✕ مسح الفلاتر</button>
        </div>
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

          <div className="table-container">
            <table className="table table-hover" style={{ textAlign: 'center', borderCollapse: 'collapse', width: '100%' }}>
              <thead style={{ background: 'var(--bg-lighter)', position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th style={{ width: 80, border: '1px solid var(--border)', padding: 8 }}>اليوم</th>
                  <th style={{ width: 100, border: '1px solid var(--border)', padding: 8 }}>التاريخ</th>
                  <th style={{ width: 120, border: '1px solid var(--border)', padding: 8 }}>الوقت</th>
                  <th style={{ width: 100, border: '1px solid var(--border)', padding: 8 }}>رقم المادة</th>
                  <th style={{ width: 50, border: '1px solid var(--border)', padding: 8 }}>ش</th>
                  <th style={{ border: '1px solid var(--border)', padding: 8 }}>اسم المادة</th>
                  <th style={{ border: '1px solid var(--border)', padding: 8 }}>اسم المحاضر</th>
                  <th style={{ border: '1px solid var(--border)', padding: 8 }}>القاعة</th>
                  <th style={{ width: 80, border: '1px solid var(--border)', padding: 8 }}>السعة</th>
                  <th style={{ width: 100, border: '1px solid var(--border)', padding: 8 }}>عدد الطلبة</th>
                  <th className="no-print" style={{ width: 60, border: '1px solid var(--border)', padding: 8 }}>حذف</th>
                </tr>
              </thead>
              <tbody>
                {orderedGroups.map((groupKey, groupIndex) => {
                  const dayExams = grouped[groupKey].sort((a, b) => {
                    if (a.is_full_day) return -1;
                    if (b.is_full_day) return 1;
                    return (a.start_time || '').localeCompare(b.start_time || '');
                  });
                  
                  const isBlue = groupIndex % 2 !== 0;
                  const rowBg = isBlue ? 'rgba(59, 130, 246, 0.05)' : 'transparent';

                  return dayExams.map((exam, i) => {
                    const isFirst = i === 0;
                    
                    if (exam.is_full_day) {
                      return (
                        <tr key={exam.id} style={{ background: 'var(--danger)', color: 'white', fontWeight: 'bold' }}>
                          <td style={{ border: '1px solid var(--border)', padding: 8 }}>{isFirst ? (DAY_AR[exam.day] || exam.day) : ''}</td>
                          <td style={{ border: '1px solid var(--border)', padding: 8 }}><span dir="ltr">{isFirst ? formatDisplayDate(exam.exam_date) : ''}</span></td>
                          <td colSpan={8} style={{ border: '1px solid var(--border)', padding: 12 }}>
                            {exam.course_name || 'عطلة / مناسبة'}
                          </td>
                          <td className="no-print" style={{ border: '1px solid var(--border)' }}>
                            <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }} onClick={() => deleteExam(exam.id)}>🗑️</button>
                          </td>
                        </tr>
                      );
                    }

                    const dayLabel = DAY_AR[exam.day] || exam.day || '-';
                    const dateLabel = formatDisplayDate(exam.exam_date) || '-';
                    
                    let timeLabel = '';
                    if (exam.start_time && exam.end_time) {
                      const s = exam.start_time.substring(0, 5);
                      const e = exam.end_time.substring(0, 5);
                      timeLabel = `${e}-${s}`;
                    } else {
                      timeLabel = exam.start_time ? exam.start_time.substring(0, 5) : '-';
                    }

                    return (
                      <tr key={exam.id} style={{ background: rowBg, opacity: ['cancelled', 'replaced'].includes(exam.status) ? 0.5 : 1 }}>
                        <td style={{ fontWeight: isFirst ? 'bold' : 'normal', border: '1px solid var(--border)', padding: 8 }}>
                          {isFirst ? dayLabel : ''}
                        </td>
                        <td style={{ fontWeight: isFirst ? 'bold' : 'normal', border: '1px solid var(--border)', padding: 8 }}>
                          {isFirst ? <span dir="ltr">{dateLabel}</span> : ''}
                          {groupKey.includes('تاريخ') && <div style={{color: 'var(--danger)', fontSize: '0.7rem'}}>يحتاج تصحيح</div>}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.9rem', border: '1px solid var(--border)', padding: 8 }}>
                          <span dir="ltr">{timeLabel}</span>
                        </td>
                        <td style={{ fontFamily: 'monospace', border: '1px solid var(--border)', padding: 8 }}>
                           {exam.course_code || '-'}
                           {exam.status === 'cancelled' && <div style={{color: 'var(--danger)', fontSize: '0.7rem'}}>ملغي</div>}
                           {exam.status === 'replaced' && <div style={{color: 'var(--warning)', fontSize: '0.7rem'}}>مستبدل</div>}
                        </td>
                        <td style={{ border: '1px solid var(--border)', padding: 8 }}>{exam.section || '-'}</td>
                        <td style={{ textAlign: 'right', border: '1px solid var(--border)', padding: 8 }}>{exam.course_name || '-'}</td>
                        <td style={{ textAlign: 'right', border: '1px solid var(--border)', padding: 8 }}>{exam.lecturer || '-'}</td>
                        <td style={{ textAlign: 'right', border: '1px solid var(--border)', padding: 8, maxWidth: 200 }}>
                          {(exam.rooms || []).join('-') || '-'}
                        </td>
                        <td style={{ border: '1px solid var(--border)', padding: 8 }}>{exam.total_capacity || '0'}</td>
                        <td style={{ border: '1px solid var(--border)', padding: 8 }}>{exam.student_count || '0'}</td>
                        <td className="no-print" style={{ border: '1px solid var(--border)', padding: 8 }}>
                          <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px' }} onClick={() => deleteExam(exam.id)}>🗑️</button>
                        </td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}