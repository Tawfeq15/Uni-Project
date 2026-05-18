import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { scheduleAPI, examsAPI, roomsAPI } from '../api';
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
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ 
    faculty: '', day: '', date_from: '', date_to: '', course_code: '', course_name: '',
    room: '', lecturer: '', source_type: '', include_cancelled: false
  });
  
  const [lecturers, setLecturers] = useState([]);
  const toast = useToast();

  // Modal State
  const [actionModal, setActionModal] = useState({ isOpen: false, type: null, exam: null });
  const [actionData, setActionData] = useState({});
  const [actionLoading, setActionLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  
  // Room suggestion state (for reschedule modal)
  const [availableRooms, setAvailableRooms] = useState([]);
  const [roomCombos, setRoomCombos] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [selectedRooms, setSelectedRooms] = useState([]);
  const [roomWarnings, setRoomWarnings] = useState([]);
  // Conflict detail state
  const [conflictDetails, setConflictDetails] = useState([]);

  useEffect(() => {
    examsAPI.getLecturers().then(data => {
      setLecturers(data.lecturers || []);
    }).catch(() => {});
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
      if (filter.course_name) params.course_name = filter.course_name;
      if (filter.room) params.room = filter.room;
      if (filter.lecturer) params.lecturer = filter.lecturer;
      if (filter.source_type) params.source_type = filter.source_type;
      
      const data = await scheduleAPI.list(params);
      let loadedExams = data.exams || [];
      if (!filter.include_cancelled) {
        loadedExams = loadedExams.filter(e => e.status !== 'cancelled' && e.status !== 'replaced');
      }
      setExams(loadedExams);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  // ==== ACTIONS ====

  function openAction(type, exam) {
    setActionModal({ isOpen: true, type, exam });
    setConflictDetails([]);
    setAvailableRooms([]);
    setRoomCombos([]);
    setSelectedRooms([]);
    setRoomWarnings([]);
    if (type === 'edit') {
      setActionData({
        exam_date: exam.exam_date || '',
        start_time: exam.start_time ? exam.start_time.substring(0, 5) : '',
        end_time: exam.end_time ? exam.end_time.substring(0, 5) : '',
        instructor_name: exam.lecturer || '',
        student_count: exam.student_count || 0,
        notes: exam.notes || '',
        status: exam.status || 'scheduled',
        faculty: exam.faculty || '',
        capacity: exam.total_capacity || '',
        rooms: exam.rooms ? exam.rooms.join('-') : ''
      });
    } else if (type === 'reschedule') {
      setActionData({
        exam_date: exam.exam_date || '',
        start_time: exam.start_time ? exam.start_time.substring(0, 5) : '',
        end_time: exam.end_time ? exam.end_time.substring(0, 5) : '',
        rooms: exam.rooms ? exam.rooms.join('-') : '',
        reason: ''
      });
      setSelectedRooms(exam.rooms || []);
    } else if (type === 'cancel') {
      setActionData({ reason: '' });
    } else if (type === 'audit') {
      setAuditLogs([]);
      setActionLoading(true);
      examsAPI.getAudit(exam.id).then(res => {
        setAuditLogs(res.audit || []);
      }).catch(err => toast(err.message, 'error')).finally(() => setActionLoading(false));
    }
  }

  function closeAction() {
    setActionModal({ isOpen: false, type: null, exam: null });
    setActionData({});
    setConflictDetails([]);
  }

  // Fetch available rooms for reschedule modal
  async function fetchAvailableRooms() {
    const { exam } = actionModal;
    if (!actionData.exam_date || !actionData.start_time || !actionData.end_time) return;
    setRoomsLoading(true);
    try {
      const res = await roomsAPI.available({
        exam_date: actionData.exam_date,
        start_time: actionData.start_time,
        end_time: actionData.end_time,
        capacity_required: exam?.student_count || 0,
        exclude_exam_id: exam?.id,
        course_code: exam?.course_code,
      });
      setAvailableRooms(res.available_rooms || []);
      setRoomCombos(res.recommended_combinations || []);
      setRoomWarnings(res.warnings || []);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setRoomsLoading(false);
    }
  }

  function toggleRoom(roomName) {
    setSelectedRooms(prev =>
      prev.includes(roomName) ? prev.filter(r => r !== roomName) : [...prev, roomName]
    );
  }

  function applyCombo(combo) {
    setSelectedRooms(combo.rooms);
  }


  async function handleActionSubmit(e) {
    e.preventDefault();
    setActionLoading(true);
    setConflictDetails([]);
    const { type, exam } = actionModal;

    try {
      if (type === 'edit') {
        const payload = {
          exam_date: actionData.exam_date || exam.exam_date,
          start_time: actionData.start_time || exam.start_time,
          end_time: actionData.end_time || exam.end_time,
          rooms: actionData.rooms ? actionData.rooms.split('-').map(r => r.trim()).filter(Boolean) : (exam.rooms || []),
          instructor_name: actionData.instructor_name,
          student_count: parseInt(actionData.student_count) || 0,
          notes: actionData.notes,
          status: actionData.status,
          faculty: actionData.faculty,
          is_full_day: exam.is_full_day,
        };
        const res = await examsAPI.updateScheduled(exam.id, payload);
        // In-place update the exam row
        if (res.data) {
          const updated = { ...res.data, rooms: JSON.parse(res.data.rooms_json || '[]') };
          setExams(prev => prev.map(ex => ex.id === exam.id ? { ...ex, ...updated } : ex));
        }
        toast('تم تحديث الامتحان بنجاح', 'success');
        closeAction();

      } else if (type === 'reschedule') {
        if (!actionData.reason?.trim()) throw new Error('يجب تحديد سبب إعادة الجدولة');
        const rooms = selectedRooms.length > 0 ? selectedRooms :
          (actionData.rooms ? actionData.rooms.split('-').map(r => r.trim()).filter(Boolean) : []);
        if (rooms.length === 0) throw new Error('يجب تحديد قاعة واحدة على الأقل');
        const payload = {
          exam_date: actionData.exam_date,
          start_time: actionData.start_time,
          end_time: actionData.end_time,
          rooms,
          reason: actionData.reason
        };
        const res = await examsAPI.rescheduleScheduled(exam.id, payload);
        if (res.data) {
          const updated = { ...res.data, rooms: JSON.parse(res.data.rooms_json || '[]') };
          setExams(prev => prev.map(ex => ex.id === exam.id ? { ...ex, ...updated } : ex));
        }
        toast('تمت إعادة جدولة الامتحان بنجاح', 'success');
        closeAction();

        closeAction();
      }
    } catch (err) {
      if (err.conflicts) {
        setConflictDetails(err.conflicts);
        toast('لا يمكن الحفظ بسبب تعارض في القاعة', 'error');
      } else {
        toast(err.message, 'error');
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteExam(exam) {
    if (!confirm('هل أنت متأكد من إلغاء هذا الاختبار؟ سيتم إزالته من الجدول.')) return;
    const reason = prompt('أدخل سبب الإلغاء (مطلوب):');
    if (!reason) return toast('يجب إدخال سبب الإلغاء', 'warning');
    
    try {
      await examsAPI.cancelScheduled(exam.id, reason);
      setExams(prev => prev.map(ex => ex.id === exam.id ? { ...ex, status: 'cancelled' } : ex));
      toast('تم إلغاء الامتحان بنجاح', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
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

  // ==== EXPORT & UI HELPERS ====

  function formatDisplayDate(d) {
    if (!d || !d.includes('-')) return d;
    const [y, m, day] = d.split('-');
    return `${day}-${m}-${y}`;
  }

  const getSourceBadge = (sourceType) => {
    switch(sourceType) {
      case 'import': return <span className="badge badge-info" style={{fontSize:'0.65rem'}}>استيراد</span>;
      case 'rescheduled': return <span className="badge badge-warning" style={{fontSize:'0.65rem'}}>معاد جدولته</span>;
      case 'conflict_approval': return <span className="badge badge-primary" style={{fontSize:'0.65rem'}}>موافق عليه</span>;
      default: return <span className="badge badge-gray" style={{fontSize:'0.65rem'}}>يدوي</span>;
    }
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'cancelled': return <span className="badge badge-danger">ملغي</span>;
      case 'replaced': return <span className="badge badge-warning">مستبدل</span>;
      default: return null;
    }
  };

  // Group by date explicitly
  const grouped = {};
  for (const exam of exams) {
    let k = exam.exam_date ? exam.exam_date : 'تاريخ غير محدد - يحتاج تصحيح';
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(exam);
  }

  const orderedGroups = Object.keys(grouped).sort((a, b) => {
    const isDateA = a.includes('-') && !a.includes('تاريخ');
    const isDateB = b.includes('-') && !b.includes('تاريخ');
    if (isDateA && isDateB) return new Date(a).getTime() - new Date(b).getTime();
    if (isDateA) return -1;
    if (isDateB) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">🗓️ الجدول النهائي للاختبارات</h1>
          <p className="page-subtitle">إدارة ومراقبة كافة الاختبارات المعتمدة في النظام</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} className="no-print">
          <button className="btn btn-danger" onClick={clearSchedule}>🗑️ تفريغ النظام</button>
          <button className="btn btn-primary" onClick={() => window.print()}>🖨️ طباعة</button>
          <button className="btn btn-success" onClick={() => scheduleAPI.exportExcel({ ...filter })}>📥 Excel</button>
          <button className="btn btn-secondary" onClick={() => scheduleAPI.exportPdf({ ...filter })}>📄 PDF</button>
          <button className="btn btn-secondary btn-icon" onClick={load}>🔄</button>
        </div>
      </div>

      {/* Modern Filter Bar */}
      <div className="card no-print" style={{ marginBottom: 20, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: '1.2rem' }}>🔍</span>
          <h3 style={{ fontSize: '1rem', margin: 0 }}>تصفية البحث</h3>
        </div>
        
        <div className="form-row">
          <div className="form-group mb-0">
             <label className="form-label">الكلية / المبنى</label>
             <select className="form-control" value={filter.faculty} onChange={e => setFilter(f => ({ ...f, faculty: e.target.value }))}>
               {FACULTY_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
             </select>
          </div>
          <div className="form-group mb-0">
             <label className="form-label">الفترة من</label>
             <input type="date" className="form-control" value={filter.date_from} onChange={e => setFilter(f => ({ ...f, date_from: e.target.value }))} />
          </div>
          <div className="form-group mb-0">
             <label className="form-label">الفترة إلى</label>
             <input type="date" className="form-control" value={filter.date_to} onChange={e => setFilter(f => ({ ...f, date_to: e.target.value }))} />
          </div>
          <div className="form-group mb-0">
             <label className="form-label">المصدر</label>
             <select className="form-control" value={filter.source_type} onChange={e => setFilter(f => ({ ...f, source_type: e.target.value }))}>
               <option value="">الكل</option>
               <option value="import">استيراد من ملف</option>
               <option value="manual">إدخال يدوي</option>
               <option value="rescheduled">إعادة جدولة</option>
             </select>
          </div>
          <div className="form-group mb-0">
             <label className="form-label">رمز أو اسم المادة</label>
             <input type="text" className="form-control" placeholder="بحث..." value={filter.course_name} onChange={e => setFilter(f => ({ ...f, course_name: e.target.value }))} />
          </div>
          <div className="form-group mb-0">
             <label className="form-label">المحاضر</label>
             <input type="text" className="form-control" list="lecturers-datalist" placeholder="بحث..." value={filter.lecturer} onChange={e => setFilter(f => ({ ...f, lecturer: e.target.value }))} />
             <datalist id="lecturers-datalist">{lecturers.map((l, i) => <option key={i} value={l} />)}</datalist>
          </div>
          <div className="form-group mb-0" style={{ display: 'flex', alignItems: 'flex-end', gap: 15 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: '0.9rem' }}>
              <input type="checkbox" checked={filter.include_cancelled} onChange={e => setFilter(f => ({ ...f, include_cancelled: e.target.checked }))} />
              إظهار الملغى والمستبدل
            </label>
            <button className="btn btn-secondary btn-sm" onClick={() => setFilter({ faculty: '', day: '', date_from: '', date_to: '', course_code: '', course_name: '', room: '', lecturer: '', source_type: '', include_cancelled: false })}>
              ✕ مسح
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="spinner"></div>
      ) : exams.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon">✅</div>
          <h3>لا توجد اختبارات ضمن الفلتر الحالي</h3>
          <p>قم بتعديل الفلتر أو استيراد جدول جديد.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>سجل الاختبارات المعتمدة</h3>
            <span className="badge badge-primary">{exams.length} نتيجة</span>
          </div>
          
          <div style={{ overflowX: 'auto' }}>
            <table className="table table-hover" style={{ borderCollapse: 'collapse', border: '1px solid var(--border)', fontSize: '0.85rem', width: '100%', minWidth: '1700px' }}>
              <thead style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '2px solid var(--border)' }}>
                <tr>
                  <th style={{ width: 180, border: '1px solid var(--border)', padding: '10px 8px', textAlign: 'center' }}>اليوم والتاريخ</th>
                  <th style={{ width: 160, border: '1px solid var(--border)', padding: '10px 8px', textAlign: 'center' }}>الوقت</th>
                  <th style={{ width: 140, border: '1px solid var(--border)', padding: '10px 8px', textAlign: 'center' }}>رقم المادة</th>
                  <th style={{ width: 100, border: '1px solid var(--border)', padding: '10px 8px', textAlign: 'center' }}>ش</th>
                  <th style={{ width: 220, border: '1px solid var(--border)', padding: '10px 8px', textAlign: 'right' }}>اسم المادة</th>
                  <th style={{ width: 280, border: '1px solid var(--border)', padding: '10px 8px', textAlign: 'right' }}>اسم المحاضر</th>
                  <th style={{ width: 280, border: '1px solid var(--border)', padding: '10px 8px', textAlign: 'center' }}>القاعات</th>
                  <th style={{ width: 150, border: '1px solid var(--border)', padding: '10px 8px', textAlign: 'center' }}>السعة / الطلبة</th>
                  <th style={{ width: 130, border: '1px solid var(--border)', padding: '10px 8px', textAlign: 'center' }}>الحالة</th>
                  <th className="no-print" style={{ width: 130, border: '1px solid var(--border)', padding: '10px 8px', textAlign: 'center' }}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {orderedGroups.map((groupKey) => {
                  const dayExams = grouped[groupKey].sort((a, b) => {
                    if (a.is_full_day) return -1;
                    if (b.is_full_day) return 1;
                    return (a.start_time || '').localeCompare(b.start_time || '');
                  });

                  return dayExams.map((exam, i) => {
                    const isFirst = i === 0;
                    
                    if (exam.is_full_day) {
                      return (
                         <tr key={exam.id} style={{ background: 'rgba(14, 165, 233, 0.1)', borderBottom: '1px solid var(--border)' }}>
                           <td colSpan={10} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: 'var(--accent)', border: '1px solid var(--border)' }}>
                             {isFirst && `🗓️ ${DAY_AR[exam.day] || exam.day} | ${formatDisplayDate(exam.exam_date)} : `}
                             {exam.course_name || 'حدث كامل اليوم'}
                           </td>
                         </tr>
                      );
                    }

                    const isCancelled = ['cancelled', 'replaced'].includes(exam.status);
                    const isEven = i % 2 === 0;
                    const rowStyle = {
                       opacity: isCancelled ? 0.6 : 1,
                       background: isCancelled ? 'rgba(239, 68, 68, 0.05)' : (exam.source_type === 'rescheduled' ? 'rgba(245, 158, 11, 0.05)' : (isEven ? 'rgba(255,255,255,0.02)' : 'transparent')),
                       borderBottom: '1px solid var(--border)'
                    };

                    let timeLabel = exam.start_time ? `${exam.start_time.substring(0, 5)} - ${exam.end_time?.substring(0, 5)}` : '-';

                    return (
                      <tr key={exam.id} style={rowStyle}>
                        <td style={{ border: '1px solid var(--border)', padding: '12px 8px', fontWeight: isFirst ? 'bold' : 'normal', textAlign: 'center', verticalAlign: 'middle' }}>
                          {isFirst && <div style={{ color: 'var(--primary)', marginBottom: '4px' }}>{DAY_AR[exam.day] || exam.day}</div>}
                          <div dir="ltr">{formatDisplayDate(exam.exam_date)}</div>
                        </td>
                        <td style={{ border: '1px solid var(--border)', padding: '12px 8px', fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: '600', textAlign: 'center', verticalAlign: 'middle' }} dir="ltr">{timeLabel}</td>
                        <td style={{ border: '1px solid var(--border)', padding: '12px 8px', textAlign: 'center', verticalAlign: 'middle', fontWeight: '500' }}>
                          {exam.course_code || '-'}
                        </td>
                        <td style={{ border: '1px solid var(--border)', padding: '12px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                          {exam.section || '-'}
                        </td>
                        <td style={{ border: '1px solid var(--border)', padding: '12px 10px', textAlign: 'right', verticalAlign: 'middle', fontWeight: 'bold', maxWidth: '220px', whiteSpace: 'normal', lineHeight: '1.4' }}>
                          {exam.course_name || '-'}
                        </td>
                        <td style={{ border: '1px solid var(--border)', padding: '12px 10px', textAlign: 'right', verticalAlign: 'middle' }}>{exam.lecturer || '-'}</td>
                        <td style={{ border: '1px solid var(--border)', padding: '12px 8px', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                            {(exam.rooms || []).map(r => <span key={r} className="badge badge-gray" style={{fontSize: '0.75rem', padding: '3px 7px', borderRadius: '4px'}}>{r}</span>)}
                          </div>
                        </td>
                        <td style={{ border: '1px solid var(--border)', padding: '12px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <div style={{ fontWeight: 'bold', color: exam.student_count > exam.total_capacity ? 'var(--danger)' : 'inherit' }}>
                            <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>م:</span> {exam.student_count} / <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>س:</span> {exam.total_capacity}
                          </div>
                        </td>
                        <td style={{ border: '1px solid var(--border)', padding: '12px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                             {getSourceBadge(exam.source_type)}
                             {getStatusBadge(exam.status)}
                          </div>
                        </td>
                        <td className="no-print" style={{ border: '1px solid var(--border)', padding: '12px 8px', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            {!isCancelled && (
                              <>
                                <button className="btn btn-primary btn-sm" style={{ padding: '2px 6px', fontSize: '0.8rem' }} onClick={() => navigate('/new-exam', { state: { editExam: exam } })} title="تعديل التفاصيل">✏️</button>
                                <button className="btn btn-danger btn-sm" style={{ padding: '2px 6px', fontSize: '0.8rem' }} onClick={() => handleDeleteExam(exam)} title="إلغاء الاختبار">❌</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action Modal (Dynamic) */}
      {actionModal.isOpen && (
        <div className="modal-overlay" onClick={closeAction}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: actionModal.type === 'audit' ? 700 : 500 }}>
            <div className="modal-header">
              <h2>
                {actionModal.type === 'edit' && '✏️ تعديل بيانات الاختبار'}
                {actionModal.type === 'reschedule' && '🔄 إعادة جدولة الاختبار'}
                {actionModal.type === 'cancel' && '❌ إلغاء الاختبار'}
                {actionModal.type === 'audit' && '📋 سجل الحركات والتعديلات'}
              </h2>
              <button className="btn btn-secondary btn-sm" onClick={closeAction}>✕</button>
            </div>
            
            <div className="modal-body" style={{ padding: '20px' }}>
               <div style={{ padding: '10px 15px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, marginBottom: 20 }}>
                 <strong>المادة:</strong> {actionModal.exam.course_code} - {actionModal.exam.course_name}
                 <br />
                 <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>الموعد الحالي: {formatDisplayDate(actionModal.exam.exam_date)} | {actionModal.exam.start_time?.substring(0,5)}</span>
               </div>

               {/* EDIT MODE */}
               {actionModal.type === 'edit' && (
                 <form id="actionForm" onSubmit={handleActionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">تاريخ الامتحان</label>
                        <input type="date" required className="form-control" value={actionData.exam_date} onChange={e => setActionData({...actionData, exam_date: e.target.value})} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">وقت البداية</label>
                        <input type="time" required className="form-control" value={actionData.start_time} onChange={e => setActionData({...actionData, start_time: e.target.value})} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">وقت النهاية</label>
                        <input type="time" required className="form-control" value={actionData.end_time} onChange={e => setActionData({...actionData, end_time: e.target.value})} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">القاعات (مفصولة بـ "-")</label>
                      <input type="text" className="form-control" value={actionData.rooms} onChange={e => setActionData({...actionData, rooms: e.target.value})} dir="ltr" />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">المحاضر الرئيسي</label>
                        <input type="text" className="form-control" value={actionData.instructor_name} onChange={e => setActionData({...actionData, instructor_name: e.target.value})} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">عدد الطلبة</label>
                        <input type="number" className="form-control" value={actionData.student_count} onChange={e => setActionData({...actionData, student_count: e.target.value})} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">ملاحظات إدارية</label>
                      <textarea className="form-control" rows="2" value={actionData.notes} onChange={e => setActionData({...actionData, notes: e.target.value})}></textarea>
                    </div>

                    {conflictDetails.length > 0 && (
                      <div className="alert alert-danger" style={{ marginTop: 10 }}>
                        <strong>تفاصيل التعارض:</strong>
                        <ul style={{ margin: '5px 0 0 20px', fontSize: '0.85rem' }}>
                          {conflictDetails.map((c, idx) => (
                            <li key={idx}>{c.message}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                 </form>
               )}


               {/* RESCHEDULE MODE */}
               {actionModal.type === 'reschedule' && (
                 <form id="actionForm" onSubmit={handleActionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                    <div className="alert alert-warning">إعادة الجدولة ستقوم بالتحقق من التعارضات الجديدة. لا يمكن الحفظ إذا كان الموعد الجديد يتعارض مع قاعات أو مدرسين.</div>
                    
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 1.5 }}>
                        <label className="form-label">التاريخ الجديد</label>
                        <input type="date" required className="form-control" value={actionData.exam_date} onChange={e => setActionData({...actionData, exam_date: e.target.value})} onBlur={fetchAvailableRooms} />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">وقت البداية</label>
                        <input type="time" required className="form-control" value={actionData.start_time} onChange={e => setActionData({...actionData, start_time: e.target.value})} onBlur={fetchAvailableRooms} />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">وقت النهاية</label>
                        <input type="time" required className="form-control" value={actionData.end_time} onChange={e => setActionData({...actionData, end_time: e.target.value})} onBlur={fetchAvailableRooms} />
                      </div>
                      <div className="form-group" style={{ flex: 'none', display: 'flex', alignItems: 'flex-end' }}>
                        <button type="button" className="btn btn-secondary" onClick={fetchAvailableRooms} disabled={roomsLoading}>
                          {roomsLoading ? '...' : 'بحث قاعات'}
                        </button>
                      </div>
                    </div>

                    {roomWarnings.length > 0 && (
                      <div className="alert alert-warning" style={{ fontSize: '0.85rem' }}>
                        <ul style={{ margin: '0 20px', padding: 0 }}>
                          {roomWarnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      </div>
                    )}

                    {roomCombos.length > 0 && (
                      <div className="form-group">
                        <label className="form-label">اقتراحات القاعات (لعدد {actionModal.exam.student_count} طالب):</label>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {roomCombos.map((combo, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => applyCombo(combo)}
                              className="btn btn-sm"
                              style={{
                                background: selectedRooms.join(',') === combo.rooms.join(',') ? 'var(--primary)' : 'rgba(99,102,241,0.1)',
                                color: selectedRooms.join(',') === combo.rooms.join(',') ? '#fff' : 'var(--primary)',
                                border: '1px solid var(--primary)',
                                borderRadius: 6
                              }}
                            >
                              {combo.rooms.join(' + ')} <span style={{ opacity: 0.8, fontSize: '0.8em' }}>({combo.total_capacity})</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="form-group">
                      <label className="form-label">القاعات المحددة (اضغط للإزالة)</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, minHeight: 45 }}>
                        {selectedRooms.length === 0 ? <span className="text-muted" style={{ fontSize: '0.85rem' }}>لم يتم تحديد قاعات</span> : null}
                        {selectedRooms.map(r => (
                          <span key={r} onClick={() => toggleRoom(r)} className="badge badge-primary" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {r} <span>✕</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {availableRooms.length > 0 && (
                      <div className="form-group">
                        <label className="form-label">قاعات متاحة أخرى:</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflowY: 'auto', padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}>
                          {availableRooms.map(room => (
                            <span
                              key={room.room_name}
                              onClick={() => toggleRoom(room.room_name)}
                              className={`badge ${selectedRooms.includes(room.room_name) ? 'badge-primary' : 'badge-gray'}`}
                              style={{ cursor: 'pointer' }}
                            >
                              {room.room_name} <small>({room.capacity})</small>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="form-group">
                      <label className="form-label">سبب إعادة الجدولة (مطلوب للتدقيق)</label>
                      <input type="text" required className="form-control" placeholder="مثال: طلب المحاضر، تعارض سابق..." value={actionData.reason} onChange={e => setActionData({...actionData, reason: e.target.value})} />
                    </div>

                    {conflictDetails.length > 0 && (
                      <div className="alert alert-danger" style={{ marginTop: 10 }}>
                        <strong>تفاصيل التعارض:</strong>
                        <ul style={{ margin: '5px 0 0 20px', fontSize: '0.85rem' }}>
                          {conflictDetails.map((c, idx) => (
                            <li key={idx}>{c.message}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                 </form>
               )}


               {/* CANCEL MODE */}
               {actionModal.type === 'cancel' && (
                 <form id="actionForm" onSubmit={handleActionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                    <div className="alert alert-danger">سيتم إزالة هذا الاختبار من الجدول النهائي وستصبح القاعات متاحة للحجز.</div>
                    <div className="form-group">
                      <label className="form-label">سبب الإلغاء (مطلوب)</label>
                      <textarea required className="form-control" rows="3" placeholder="اذكر سبب الإلغاء للرجوع إليه لاحقاً..." value={actionData.reason} onChange={e => setActionData({...actionData, reason: e.target.value})}></textarea>
                    </div>
                 </form>
               )}

               {/* AUDIT MODE */}
               {actionModal.type === 'audit' && (
                 <div>
                    {actionLoading ? <div className="spinner spinner-sm"></div> : auditLogs.length === 0 ? <p className="text-muted">لا يوجد سجل حركات.</p> : (
                      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                        {auditLogs.map((log, idx) => (
                          <div key={idx} style={{ padding: 12, borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', marginBottom: 8, borderRadius: 6 }}>
                             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                               <span className="badge badge-gray">{log.action}</span>
                               <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }} dir="ltr">{new Date(log.created_at).toLocaleString()}</span>
                             </div>
                             <div style={{ fontSize: '0.85rem' }}>
                               <strong>المستخدم:</strong> {log.operator_name} ({log.operator_role})
                             </div>
                             {log.new_values && log.new_values.reason && (
                               <div style={{ fontSize: '0.85rem', marginTop: 4, color: 'var(--warning)' }}>
                                 <strong>السبب:</strong> {log.new_values.reason}
                               </div>
                             )}
                          </div>
                        ))}
                      </div>
                    )}
                 </div>
               )}
            </div>

            {actionModal.type !== 'audit' && (
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: 20, borderTop: '1px solid var(--border)' }}>
                <button type="button" className="btn btn-secondary" onClick={closeAction} disabled={actionLoading}>إلغاء</button>
                <button type="submit" form="actionForm" className={`btn ${actionModal.type === 'cancel' ? 'btn-danger' : 'btn-primary'}`} disabled={actionLoading}>
                  {actionLoading ? 'جاري المعالجة...' : 'تأكيد'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}