import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { examsAPI } from '../api';

const localizer = momentLocalizer(moment);

const messagesAr = {
  allDay: 'طوال اليوم', previous: 'السابق', next: 'التالي', today: 'اليوم',
  month: 'شهر', week: 'أسبوع', day: 'يوم', agenda: 'مفكرة',
  date: 'تاريخ', time: 'وقت', event: 'حدث',
  noEventsInRange: 'لا توجد اختبارات في هذه الفترة.',
  showMore: total => `+ عرض المزيد (${total})`,
};

const STATUS_LABELS = {
  scheduled: { label: 'مجدول', color: 'var(--success)' },
  pending: { label: 'معلق', color: 'var(--warning)' },
  cancelled: { label: 'ملغى', color: 'var(--danger)' },
  rejected: { label: 'مرفوض', color: 'var(--danger)' },
  submitted: { label: 'مقدّم', color: 'var(--primary)' },
  registrar_approved: { label: 'موافَق عليه', color: 'var(--success)' },
};

export default function CalendarView() {
  const [allExams, setAllExams] = useState([]);
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    course: '', room: '', instructor: '', status: '', dateFrom: '', dateTo: '',
  });

  useEffect(() => { fetchExams(); }, []);

  useEffect(() => { applyFilters(); }, [allExams, filters]);

  async function fetchExams() {
    setLoading(true);
    try {
      const data  = await examsAPI.listScheduled();
      setAllExams(data.exams || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function toEvent(exam) {
    let start = new Date();
    let end   = new Date();
    if (exam.exam_date && exam.start_time && exam.end_time) {
      const [y, m, d] = exam.exam_date.split('-');
      const [sh, sm]  = exam.start_time.split(':');
      const [eh, em]  = exam.end_time.split(':');
      start = new Date(y, m - 1, d, sh, sm);
      end   = new Date(y, m - 1, d, eh, em);
    }
    return { id: exam.id, title: `${exam.course_code} — ${exam.course_name || ''}`, start, end, resource: exam };
  }

  function applyFilters() {
    let list = [...allExams];
    if (filters.course)     list = list.filter(e => (e.course_code + ' ' + e.course_name).toLowerCase().includes(filters.course.toLowerCase()));
    if (filters.room)       list = list.filter(e => (e.rooms_json || '').includes(filters.room));
    if (filters.instructor) list = list.filter(e => (e.lecturer || '').toLowerCase().includes(filters.instructor.toLowerCase()));
    if (filters.status)     list = list.filter(e => e.status === filters.status);
    if (filters.dateFrom)   list = list.filter(e => e.exam_date && e.exam_date >= filters.dateFrom);
    if (filters.dateTo)     list = list.filter(e => e.exam_date && e.exam_date <= filters.dateTo);
    setEvents(list.map(toEvent));
  }

  function setFilter(key, val) {
    setFilters(prev => ({ ...prev, [key]: val }));
  }

  function clearFilters() {
    setFilters({ course: '', room: '', instructor: '', status: '', dateFrom: '', dateTo: '' });
  }

  const eventStyleGetter = (event) => {
    const status = event.resource?.status;
    let bg = 'var(--primary)';
    if (status === 'cancelled' || status === 'rejected') bg = 'var(--danger)';
    else if (status === 'registrar_approved') bg = '#16a34a';
    return { style: { backgroundColor: bg, borderRadius: 4, color: '#fff', border: '0', display: 'block' } };
  };

  async function handleSelectEvent(event) {
    setSelectedEvent({ ...event.resource, _loading: true });
    setLoadingDetail(true);
    try {
      const data = await examsAPI.showScheduled(event.resource.id);
      setSelectedEvent(data.exam);
    } catch {
      setSelectedEvent({ ...event.resource, _loading: false });
    } finally {
      setLoadingDetail(false);
    }
  }

  const activeFilters = Object.values(filters).some(Boolean);

  return (
    <div className="page" style={{ height: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="page-title">📅 التقويم الشامل</h1>
          <p className="page-subtitle">عرض الجداول الزمنية للاختبارات مع فلاتر متقدمة</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchExams}>🔄 تحديث</button>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ flexShrink: 0, padding: '12px 16px', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 130 }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>كود/اسم المادة</label>
            <input className="form-control" style={{ padding: '5px 8px', fontSize: '0.82rem' }}
              placeholder="بحث..." value={filters.course} onChange={e => setFilter('course', e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 110 }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>القاعة</label>
            <input className="form-control" style={{ padding: '5px 8px', fontSize: '0.82rem' }}
              placeholder="رقم القاعة" value={filters.room} onChange={e => setFilter('room', e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 130 }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>المحاضر</label>
            <input className="form-control" style={{ padding: '5px 8px', fontSize: '0.82rem' }}
              placeholder="اسم المحاضر" value={filters.instructor} onChange={e => setFilter('instructor', e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>الحالة</label>
            <select className="form-control" style={{ padding: '5px 8px', fontSize: '0.82rem' }}
              value={filters.status} onChange={e => setFilter('status', e.target.value)}>
              <option value="">كل الحالات</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>من تاريخ</label>
            <input type="date" className="form-control" style={{ padding: '5px 8px', fontSize: '0.82rem' }}
              value={filters.dateFrom} onChange={e => setFilter('dateFrom', e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>إلى تاريخ</label>
            <input type="date" className="form-control" style={{ padding: '5px 8px', fontSize: '0.82rem' }}
              value={filters.dateTo} onChange={e => setFilter('dateTo', e.target.value)} />
          </div>
          {activeFilters && (
            <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-end' }} onClick={clearFilters}>
              ✕ مسح الفلاتر
            </button>
          )}
          <span style={{ alignSelf: 'flex-end', fontSize: '0.78rem', color: 'var(--text-muted)', marginRight: 'auto' }}>
            {events.length} اختبار
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexGrow: 1, minHeight: 0 }}>
        {/* Calendar */}
        <div className="card" style={{ flexGrow: 1, padding: 16, minHeight: 0 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <span className="spinner"></span>
            </div>
          ) : (
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              messages={messagesAr}
              culture="ar-SA"
              eventPropGetter={eventStyleGetter}
              style={{ height: '100%', fontFamily: 'inherit' }}
              onSelectEvent={handleSelectEvent}
              tooltipAccessor={e => `${e.title}\nالمحاضر: ${e.resource.lecturer || 'غير محدد'}\nالقاعات: ${e.resource.rooms?.join(' - ') || e.resource.rooms_json || ''}`}
            />
          )}
        </div>

        {/* Detail Panel */}
        {selectedEvent && (
          <div className="card animate-fade-in" style={{ width: 310, flexShrink: 0, overflowY: 'auto', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: '0.95rem', margin: 0 }}>📋 تفاصيل الاختبار</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedEvent(null)}>✕</button>
            </div>

            {loadingDetail ? (
              <div style={{ textAlign: 'center', padding: 20 }}><span className="spinner spinner-sm"></span></div>
            ) : (
              <>
                <CalRow label="كود المادة" value={<strong style={{ color: 'var(--accent)' }}>{selectedEvent.course_code}</strong>} />
                <CalRow label="اسم المادة" value={selectedEvent.course_name} />
                <CalRow label="التاريخ" value={selectedEvent.exam_date} />
                <CalRow label="الوقت" value={selectedEvent.start_time && `${selectedEvent.start_time} – ${selectedEvent.end_time}`} />
                <CalRow label="المدة" value={selectedEvent.duration_minutes ? `${selectedEvent.duration_minutes} دقيقة` : null} />
                <CalRow label="المحاضر" value={selectedEvent.lecturer} />
                <CalRow label="القاعات" value={
                  selectedEvent.rooms_detail?.length > 0
                    ? selectedEvent.rooms_detail.map(r => `${r.room_name} (${r.assigned_students_count} طالب)`).join(' | ')
                    : (selectedEvent.rooms?.join(' | ') || selectedEvent.rooms_json)
                } />
                <CalRow label="إجمالي الطلاب" value={selectedEvent.student_count ? `${selectedEvent.student_count} طالب` : null} />

                {/* Sections */}
                {selectedEvent.sections?.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>الشعب المشمولة ({selectedEvent.sections.length})</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {selectedEvent.sections.map((s, i) => (
                        <span key={i} className="badge badge-info" title={s.instructor_name}>
                          ش{s.section_number} ({s.student_count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Status */}
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>الحالة</div>
                  <span className="badge" style={{ background: STATUS_LABELS[selectedEvent.status]?.color || 'var(--primary)', color: '#fff' }}>
                    {STATUS_LABELS[selectedEvent.status]?.label || selectedEvent.status}
                  </span>
                </div>

                {/* Approvals timeline */}
                {selectedEvent.approvals?.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6 }}>سجل الموافقات</div>
                    {selectedEvent.approvals.map((a, i) => (
                      <div key={i} style={{ borderRight: '2px solid var(--primary)', paddingRight: 8, marginBottom: 8, fontSize: '0.75rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{a.action} ← {a.reviewer_name || 'Exam Coordinator'}</div>
                        <div style={{ color: 'var(--text-muted)' }}>{a.previous_status} → {a.new_status}</div>
                        {a.comment && <div style={{ color: 'var(--accent)', marginTop: 2 }}>{a.comment}</div>}
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{a.created_at ? new Date(a.created_at).toLocaleString('ar-SA') : ''}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CalRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>{value}</div>
    </div>
  );
}
