import React, { useState, useEffect } from 'react';
import { examsAPI, availabilityAPI, formatConflictErrors, coursesAPI } from '../api';
import { useToast } from '../components/Toast';

const DAY_AR = {
  sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء', thursday: 'الخميس', friday: 'الجمعة', saturday: 'السبت',
};

// Maps day name to JS Date.getDay() index (0=Sunday)
const DAY_JS_INDEX = {
  sunday: 0, monday: 1, tuesday: 2,
  wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

/** Returns true if the given YYYY-MM-DD date falls on dayName */
function dateMatchesDay(dateStr, dayName) {
  if (!dateStr || !dayName) return true; // no constraint
  // Parse as local date to avoid timezone shift (split manually)
  const [y, m, d] = dateStr.split('-').map(Number);
  const jsDay = new Date(y, m - 1, d).getDay();
  return jsDay === DAY_JS_INDEX[dayName];
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];

const FACULTY_OPTIONS = [
  { value: '', label: 'كل المختبرات' },
  { value: 'it_library', label: 'كل المختبرات (IT + المكتبة)' },
  { value: 'it', label: 'مختبرات IT' },
  { value: 'library', label: 'مختبرات المكتبة' },
  { value: 'media', label: 'مختبرات الإعلام' },
  { value: 'literature', label: 'مختبرات الآداب' },
  { value: 'law', label: 'مختبرات الحقوق' },
  { value: 'architecture', label: 'مختبرات العمارة' },
];

// Lab details for display
const LAB_INFO = {
  // مختبرات المكتبة
  '2101': { capacity: 26, building: 'مختبرات المكتبة', floor: '1' },
  '2102': { capacity: 26, building: 'مختبرات المكتبة', floor: '1' },
  '2103': { capacity: 26, building: 'مختبرات المكتبة', floor: '1' },
  '2104': { capacity: 26, building: 'مختبرات المكتبة', floor: '1' },
  '2105': { capacity: 26, building: 'مختبرات المكتبة', floor: '1' },
  '2106': { capacity: 26, building: 'مختبرات المكتبة', floor: '1' },
  '2107': { capacity: 36, building: 'مختبرات المكتبة', floor: '1' },
  // مختبرات IT
  '7325': { capacity: 24, building: 'IT', floor: '3' },
  '7416': { capacity: 24, building: 'IT', floor: '4' },
  '7417': { capacity: 20, building: 'IT', floor: '4' },
  '7418': { capacity: 18, building: 'IT', floor: '4' },
  '7419': { capacity: 26, building: 'IT', floor: '4' },
  '7420': { capacity: 26, building: 'IT', floor: '4' },
  '7422': { capacity: 26, building: 'IT', floor: '4' },
  '7424': { capacity: 26, building: 'IT', floor: '4' },
  '7426': { capacity: 26, building: 'IT', floor: '4' },
  '7428': { capacity: 26, building: 'IT', floor: '4' },
  // مختبرات الإعلام
  '3117': { capacity: 24, building: 'مختبرات الإعلام', floor: '1' },
  '3118': { capacity: 24, building: 'مختبرات الإعلام', floor: '1' },
  '3301': { capacity: 23, building: 'مختبرات الإعلام', floor: '3' },
  '3302': { capacity: 24, building: 'مختبرات الإعلام', floor: '3' },
  '3303': { capacity: 24, building: 'مختبرات الإعلام', floor: '3' },
  '3309': { capacity: 24, building: 'مختبرات الإعلام', floor: '3' },
  '3310': { capacity: 24, building: 'مختبرات الإعلام', floor: '3' },
  '3311': { capacity: 24, building: 'مختبرات الإعلام', floor: '3' },
  // مختبرات الآداب (Literature)
  '6304': { capacity: 30, building: 'مختبرات الآداب', floor: '3' },
  '6320': { capacity: 20, building: 'مختبرات الآداب', floor: '3' },
  '6202': { capacity: 20, building: 'مختبرات الآداب', floor: '2' },
  '6325': { capacity: 20, building: 'مختبرات الآداب', floor: '3' },
  // مختبرات الحقوق
  '3411': { capacity: 24, building: 'مبنى الإعلام/الحقوق', floor: '4' },
  // مختبرات العمارة
  '4313': { capacity: 23, building: 'مبنى العمارة', floor: '3' },
  '4315': { capacity: 23, building: 'مبنى العمارة', floor: '3' },
  '4310': { capacity: 23, building: 'مبنى العمارة', floor: '3' },
  '4210': { capacity: 25, building: 'مبنى العمارة', floor: '2' },
  '4217': { capacity: 22, building: 'مبنى العمارة', floor: '2' },
  '4428': { capacity: 21, building: 'مبنى العمارة', floor: '4' },
  '4121': { capacity: 21, building: 'مبنى العمارة', floor: '1' },
  '4221': { capacity: 21, building: 'مبنى العمارة', floor: '2' },
};

function formatTime12(t24) {
  if (!t24) return '';
  const [h, m] = t24.split(':');
  let hh = parseInt(h, 10);
  if (hh > 12) hh -= 12;
  if (hh === 0) hh = 12;
  return `${hh.toString().padStart(2, '0')}:${m}`;
}

export default function NewExam() {
  const toast = useToast();
  const [form, setForm] = useState({
    course_code: '', course_name: '', section: '', lecturer: '',
    student_count: '', faculty: '', preferred_day: '', preferred_date: '',
    duration_minutes: '60', preferred_time_from: '', preferred_time_to: '', notes: '',
    time_allocation_mode: 'auto',
    is_full_day: false, booking_scope: 'selected_rooms', exam_type: '', expected_students: '',
  });
  const [suggestions, setSuggestions] = useState([]);
  const [rejected, setRejected] = useState([]);
  const [loadingSugg, setLoadingSugg] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [requests, setRequests] = useState([]);
  const [freeSlots, setFreeSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [dateError, setDateError] = useState('');
  const [courses, setCourses] = useState([]);
  const [conflictDetails, setConflictDetails] = useState([]);
  
  // Duplicate replacement state
  const [duplicateModal, setDuplicateModal] = useState({ show: false, details: null });

  // Auto-sections state
  const [courseSections, setCourseSections] = useState([]);
  const [selectedSections, setSelectedSections] = useState([]);
  const [loadingSections, setLoadingSections] = useState(false);

  useEffect(() => { 
    loadRequests(); 
    coursesAPI.list().then(data => setCourses(data.data || []));
  }, []);

  // Recalculate total students, sections, and lecturers when selected sections change
  useEffect(() => {
    if (courseSections.length > 0) {
      const selected = courseSections.filter(s => selectedSections.includes(s.section_key));
      const total = selected.reduce((sum, s) => sum + s.student_count, 0);
      
      const sectionsStr = selected.map(s => s.section_number).join(', ');
      const lecturersStr = Array.from(new Set(selected.map(s => s.instructor_name))).join(', ');
      
      setForm(prev => ({ 
        ...prev, 
        student_count: total,
        section: sectionsStr,
        lecturer: lecturersStr
      }));
    }
  }, [selectedSections, courseSections]);

  useEffect(() => {
    if (form.preferred_day) {
      fetchSuggestions();
      fetchFreeSlots();
    }
  }, [form.faculty, form.preferred_day, form.duration_minutes, form.student_count]);

  async function loadRequests() {
    try {
      const data = await examsAPI.listRequests();
      setRequests(data.exams || []);
    } catch {}
  }

  function getFacultyLabel(val) {
    return FACULTY_OPTIONS.find(f => f.value === val)?.label || val || 'غير محدد';
  }

  function setField(key, val) {
    setForm(prev => ({ ...prev, [key]: val }));
    setSelectedSlot(null);
    setSuggestions([]);
    setFreeSlots([]);
    setConflictDetails([]);
    // Clear date error when day or date changes
    if (key === 'preferred_day' || key === 'preferred_date') setDateError('');
  }

  async function handleCourseSelect(code, localCourseName = '') {
    setField('course_code', code);
    if (!code) {
      setCourseSections([]);
      setSelectedSections([]);
      setField('student_count', '');
      setField('course_name', '');
      return;
    }

    if (localCourseName) {
      setField('course_name', localCourseName);
    }
    
    setLoadingSections(true);
    try {
      const res = await coursesAPI.getSections(code);
      const allSecs = res.sections || [];
      setCourseSections(allSecs);
      // Auto select all by default
      setSelectedSections(allSecs.map(s => s.section_key));
      setForm(prev => ({ ...prev, course_name: res.course.course_name || localCourseName }));
    } catch (e) {
      toast('لم يتم العثور على شعب لهذه المادة. قد تكون البيانات غير صالحة.', 'warning');
      setCourseSections([]);
      setSelectedSections([]);
    } finally {
      setLoadingSections(false);
    }
  }

  function handleDateChange(dateVal) {
    if (dateVal && form.preferred_day && !dateMatchesDay(dateVal, form.preferred_day)) {
      setDateError(
        `⚠️ التاريخ المختار ليس يوم ${DAY_AR[form.preferred_day]}! الرجاء اختيار تاريخ صحيح.`
      );
      // Still store the value so the user sees it, but show the error
      setForm(prev => ({ ...prev, preferred_date: dateVal }));
    } else {
      setDateError('');
      setField('preferred_date', dateVal);
    }
  }

  async function fetchFreeSlots() {
    if (form.time_allocation_mode !== 'manual' || !form.preferred_day) return;
    setLoadingSlots(true);
    try {
      const params = {
        day: form.preferred_day,
        duration: form.duration_minutes ? parseInt(form.duration_minutes) : 60,
        studentCount: form.student_count ? parseInt(form.student_count) : 0,
        roomType: 'lab',
      };
      if (form.faculty) params.faculty = form.faculty;
      if (form.time_allocation_mode === 'manual') {
        if (form.preferred_time_from) params.timeFrom = form.preferred_time_from;
        if (form.preferred_time_to) params.timeTo = form.preferred_time_to;
      }
      const data = await availabilityAPI.freeSlots(params);
      setFreeSlots(data.slots || []);
    } catch (e) {
      console.error('Free slots error:', e);
    } finally {
      setLoadingSlots(false);
    }
  }

  async function fetchSuggestions() {
    setLoadingSugg(true);
    setSuggestions([]);
    setSelectedSlot(null);
    try {
      const result = await examsAPI.suggestSlot({
        faculty: form.faculty || null,
        day: form.time_allocation_mode === 'manual' ? (form.preferred_day || null) : null,
        duration: form.duration_minutes ? parseInt(form.duration_minutes) : null,
        studentCount: form.student_count ? parseInt(form.student_count) : 0,
        lecturer: form.lecturer || null,
        roomType: 'lab',
        timeFrom: form.time_allocation_mode === 'manual' ? (form.preferred_time_from || null) : null,
        timeTo: form.time_allocation_mode === 'manual' ? (form.preferred_time_to || null) : null,
      });
      setSuggestions(result.suggestions || []);
      setRejected(result.rejected || []);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoadingSugg(false);
    }
  }

  /** Returns full section objects for the currently selected section keys */
  function getSelectedSectionObjects() {
    return courseSections.filter(s => selectedSections.includes(s.section_key));
  }

  async function handleSaveRequest() {
    if (!form.faculty) return toast('يجب تحديد المبنى', 'warning');
    if (!form.course_code) return toast('يجب إدخال كود المادة', 'warning');
    if (dateError) return toast('التاريخ لا يتطابق مع اليوم المختار. صحح التاريخ أولاً.', 'error');
    const sectionObjects = getSelectedSectionObjects();
    if (sectionObjects.length === 0) return toast('يجب تحديد شعبة واحدة على الأقل', 'warning');
    try {
      await examsAPI.createRequest({
        ...form,
        duration_minutes: parseInt(form.duration_minutes) || 60,
        room_type_preference: 'lab',
        selected_sections: sectionObjects,
      });
      toast('تم حفظ طلب الاختبار', 'success');
      loadRequests();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function handleScheduleExam() {
    if (!selectedSlot) return toast('يجب اختيار وقت مقترح أولاً', 'warning');
    if (!form.course_code) return toast('يجب إدخال كود المادة', 'warning');
    if (dateError) return toast('التاريخ لا يتطابق مع اليوم المختار. صحح التاريخ أولاً.', 'error');
    const sectionObjects = getSelectedSectionObjects();
    if (sectionObjects.length === 0) return toast('يجب تحديد شعبة واحدة على الأقل قبل الجدولة', 'warning');
    setSaving(true);
    setConflictDetails([]);
    try {
      await examsAPI.schedule({
        faculty: form.faculty,
        day: selectedSlot.day,
        exam_date: form.preferred_date || null,
        start_time: selectedSlot.start_time,
        end_time: selectedSlot.end_time,
        duration_minutes: selectedSlot.duration_minutes,
        lecturer: form.lecturer,
        rooms: selectedSlot.rooms,
        total_capacity: selectedSlot.total_capacity,
        course_code: form.course_code,
        course_name: form.course_name,
        section: form.section,
        selected_sections: sectionObjects,
        is_full_day: form.is_full_day,
        booking_scope: form.booking_scope,
        exam_type: form.exam_type,
        expected_students: form.expected_students,
      });
      toast('✅ تم جدولة الاختبار بنجاح!', 'success');
      setForm({
        course_code: '', course_name: '', section: '', lecturer: '',
        student_count: '', faculty: '', preferred_day: '', preferred_date: '',
        duration_minutes: '60', preferred_time_from: '', preferred_time_to: '', notes: '',
        time_allocation_mode: 'auto',
        is_full_day: false, booking_scope: 'selected_rooms', exam_type: '', expected_students: '',
      });
      setCourseSections([]);
      setSelectedSections([]);
      setSuggestions([]);
      setSelectedSlot(null);
      setFreeSlots([]);
      setConflictDetails([]);
      loadRequests();
    } catch (e) {
      if (e.requires_replacement_confirmation) {
        setDuplicateModal({ show: true, details: e.duplicate });
        toast('يوجد حجز مسبق لهذه المادة. يرجى المراجعة.', 'warning');
      } else if (e.isConflict && e.conflicts?.length) {
        setConflictDetails(e.conflicts);
        toast('❌ تعذّرت الجدولة — يوجد تعارض. راجع التفاصيل أدناه.', 'error');
      } else {
        toast(e.message, 'error');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleReplaceConfirm() {
    setSaving(true);
    setConflictDetails([]);
    try {
      await examsAPI.schedule({
        faculty: form.faculty,
        day: selectedSlot.day,
        exam_date: form.preferred_date || null,
        start_time: selectedSlot.start_time,
        end_time: selectedSlot.end_time,
        duration_minutes: selectedSlot.duration_minutes,
        lecturer: form.lecturer,
        rooms: selectedSlot.rooms,
        total_capacity: selectedSlot.total_capacity,
        course_code: form.course_code,
        course_name: form.course_name,
        section: form.section,
        selected_sections: getSelectedSectionObjects(),
        is_full_day: form.is_full_day,
        booking_scope: form.booking_scope,
        exam_type: form.exam_type,
        expected_students: form.expected_students,
        force_replace: true,
        existing_exam_ids: duplicateModal.details?.existing_exam_ids || []
      });
      toast('✅ تم تحديث الموعد واستبدال الحجز القديم بنجاح!', 'success');
      setDuplicateModal({ show: false, details: null });
      setForm({
        course_code: '', course_name: '', section: '', lecturer: '',
        student_count: '', faculty: '', preferred_day: '', preferred_date: '',
        duration_minutes: '60', preferred_time_from: '', preferred_time_to: '', notes: '',
        time_allocation_mode: 'auto',
        is_full_day: false, booking_scope: 'selected_rooms', exam_type: '', expected_students: '',
      });
      setCourseSections([]);
      setSelectedSections([]);
      setSuggestions([]);
      setSelectedSlot(null);
      setFreeSlots([]);
      setConflictDetails([]);
      loadRequests();
    } catch (e) {
      if (e.isConflict && e.conflicts?.length) {
        setConflictDetails(e.conflicts);
        toast('❌ تعذّرت الجدولة — يوجد تعارض. راجع التفاصيل أدناه.', 'error');
      } else {
        toast(e.message, 'error');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(id) {
    try {
      await examsAPI.approveRequest(id, 'موافق');
      toast('✅ تمت الموافقة على الطلب', 'success');
      loadRequests();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function handleReject(id) {
    const comment = prompt('سبب الرفض (مطلوب):');
    if (!comment) return toast('يجب إدخال سبب الرفض', 'warning');
    try {
      await examsAPI.rejectRequest(id, comment);
      toast('تم رفض الطلب', 'info');
      loadRequests();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function handleSubmit(id) {
    try {
      await examsAPI.submitRequest(id);
      toast('تم تقديم الطلب للمراجعة', 'success');
      loadRequests();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function handleCancel(id) {
    if (!confirm('هل تريد إلغاء هذا الطلب؟')) return;
    try {
      await examsAPI.cancelRequest(id);
      toast('تم إلغاء الطلب', 'info');
      loadRequests();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function deleteRequest(id) {
    if (!confirm('حذف هذا الطلب؟')) return;
    try {
      await examsAPI.deleteRequest(id);
      loadRequests();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // Group free slots by room for the availability table
  const slotsByRoom = {};
  for (const s of freeSlots) {
    if (!slotsByRoom[s.room]) slotsByRoom[s.room] = [];
    slotsByRoom[s.room].push(s);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">➕ طلب اختبار جديد</h1>
          <p className="page-subtitle">أدخل تفاصيل الاختبار لعرض المختبرات المتاحة واقتراحات الجدولة</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowRequests(r => !r)}>
          📋 الطلبات ({requests.length})
        </button>
      </div>

      <div className="two-col">
        {/* Left: Form */}
        <div>
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 20 }}>📝 بيانات الاختبار</h3>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">كود المادة *</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="text" list="courses-list" className="form-control" placeholder="مثال: 601105" value={form.course_code} onChange={e => {
                    const val = e.target.value;
                    const matched = courses.find(c => String(c.course_code).trim() === String(val).trim());
                    if (matched) {
                      handleCourseSelect(val, matched.course_name);
                    } else {
                      setField('course_code', val);
                    }
                  }} />
                  {loadingSections && <span className="spinner spinner-sm"></span>}
                </div>
                <datalist id="courses-list">
                  {courses.map((c, i) => <option key={i} value={c.course_code}>{c.course_name}</option>)}
                </datalist>
              </div>
              <div className="form-group">
                <label className="form-label">اسم المادة</label>
                <input type="text" list="course-names-list" className="form-control" placeholder="اسم المادة" value={form.course_name} onChange={e => {
                  const val = e.target.value;
                  const matched = courses.find(c => String(c.course_name).trim() === String(val).trim());
                  if (matched) {
                    handleCourseSelect(matched.course_code, matched.course_name);
                  } else {
                    setField('course_name', val);
                  }
                }} />
                <datalist id="course-names-list">
                  {courses.filter(c => c.course_name).map((c, i) => <option key={i} value={c.course_name}>{c.course_code}</option>)}
                </datalist>
              </div>
            </div>



            <div className="form-row">
              <div className="form-group" style={{ 
                  background: form.is_full_day ? 'var(--primary-glow)' : 'transparent',
                  padding: 10, borderRadius: 8, border: form.is_full_day ? '1px solid var(--primary)' : '1px solid transparent',
                  display: 'flex', alignItems: 'center', gap: 10
                }}>
                <input 
                  type="checkbox" 
                  id="is_full_day"
                  checked={form.is_full_day}
                  onChange={e => setField('is_full_day', e.target.checked)}
                  style={{ transform: 'scale(1.2)' }}
                />
                <label htmlFor="is_full_day" style={{ margin: 0, fontWeight: 'bold', color: form.is_full_day ? 'var(--primary)' : 'inherit', cursor: 'pointer' }}>
                  حجز يوم كامل (امتحان كفاءة / جامعة)
                </label>
              </div>
            </div>

            {form.is_full_day && (
              <div className="animate-fade-in" style={{ padding: 15, background: 'rgba(99,102,241,0.05)', borderRadius: 8, border: '1px solid var(--primary)', marginBottom: 20 }}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">نوع الامتحان</label>
                    <input type="text" className="form-control" placeholder="مثال: امتحان كفاءة جامعي" value={form.exam_type} onChange={e => setField('exam_type', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">نطاق الحجز</label>
                    <select className="form-control" value={form.booking_scope} onChange={e => setField('booking_scope', e.target.value)}>
                      <option value="selected_rooms">قاعات محددة (عبر الكلية)</option>
                      <option value="all_university">كامل الجامعة (كل القاعات)</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">الطلاب المتوقعين</label>
                    <input type="number" className="form-control" value={form.expected_students} onChange={e => setField('expected_students', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">تاريخ الحجز (إلزامي) *</label>
                    <input type="date" className="form-control" required value={form.preferred_date} onChange={e => handleDateChange(e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">المبنى / الكلية</label>
                <select className="form-control" disabled={form.is_full_day && form.booking_scope === 'all_university'} value={form.faculty} onChange={e => setField('faculty', e.target.value)}>
                  {FACULTY_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">عدد الطلاب *</label>
                <input 
                  type="number" 
                  className="form-control" 
                  placeholder="عدد طلاب الاختبار" 
                  min="0" 
                  value={form.student_count} 
                  onChange={e => setField('student_count', e.target.value)} 
                  readOnly={courseSections.length > 0}
                  style={courseSections.length > 0 ? { background: 'var(--bg-lighter)' } : {}}
                />
              </div>
            </div>

            {/* Time Selection Mode Toggle */}
            {!form.is_full_day && (
              <>
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label">⏰ تخصيص الوقت</label>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: 10,
                background: 'var(--bg-lighter)',
                padding: 6,
                borderRadius: 12,
                border: '1px solid var(--border-color)'
              }}>
                <button 
                  type="button"
                  className={`btn ${form.time_allocation_mode === 'auto' ? 'btn-primary' : ''}`}
                  onClick={() => setField('time_allocation_mode', 'auto')}
                  style={{ 
                    borderRadius: 8, 
                    border: 'none',
                    boxShadow: form.time_allocation_mode === 'auto' ? '0 4px 12px rgba(99, 102, 241, 0.3)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  🤖 تلقائي (AUTO)
                </button>
                <button 
                  type="button"
                  className={`btn ${form.time_allocation_mode === 'manual' ? 'btn-primary' : ''}`}
                  onClick={() => setField('time_allocation_mode', 'manual')}
                  style={{ 
                    borderRadius: 8, 
                    border: 'none',
                    boxShadow: form.time_allocation_mode === 'manual' ? '0 4px 12px rgba(99, 102, 241, 0.3)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  ✍️ يدوي (Manual)
                </button>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
                {form.time_allocation_mode === 'auto' 
                  ? '✨ سيقوم النظام بالبحث عن أفضل وقت متاح لك في جميع الأيام تلقائياً.' 
                  : '📍 قم بتحديد اليوم والنطاق الزمني المفضل لديك للبحث فيه.'}
              </p>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">مدة الاختبار (دقيقة) *</label>
                <select className="form-control" value={form.duration_minutes} onChange={e => setField('duration_minutes', e.target.value)}>
                  <option value="60">60 دقيقة (ساعة)</option>
                  <option value="90">90 دقيقة (ساعة ونصف)</option>
                  <option value="120">120 دقيقة (ساعتان)</option>
                  <option value="150">150 دقيقة</option>
                  <option value="180">180 دقيقة (3 ساعات)</option>
                </select>
              </div>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <div style={{
                  background: 'var(--primary-glow)',
                  border: '1px solid var(--primary)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: '0.8rem',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  🔬 نوع القاعة: <strong>مختبر محوسب</strong>
                </div>
              </div>
            </div>
            </>
            )}

            {/* Manual Mode Settings Block */}
            {(!form.is_full_day && form.time_allocation_mode === 'manual') && (
              <div className="animate-fade-in" style={{ 
                padding: '20px', 
                background: 'rgba(255, 255, 255, 0.02)', 
                borderRadius: '12px', 
                border: '1px solid var(--border)', 
                marginBottom: '20px' 
              }}>
                <h4 style={{ marginBottom: 16, fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ⚙️ إعدادات الوقت اليدوية
                </h4>
                
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">اليوم المفضل *<span style={{color:'var(--danger)'}}>*</span></label>
                    <select className="form-control" value={form.preferred_day} onChange={e => setField('preferred_day', e.target.value)}>
                      <option value="">-- اختر اليوم --</option>
                      {DAYS.map(d => <option key={d} value={d}>{DAY_AR[d]}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">التاريخ المفضل (اختياري)</label>
                    <input
                      type="date"
                      className="form-control"
                      value={form.preferred_date}
                      onChange={e => handleDateChange(e.target.value)}
                      style={dateError ? { borderColor: 'var(--danger)', boxShadow: '0 0 0 2px rgba(239,68,68,0.2)' } : {}}
                    />
                    {dateError && (
                      <div style={{
                        marginTop: 5,
                        fontSize: '0.78rem',
                        color: 'var(--danger)',
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: 6,
                        padding: '5px 10px',
                      }}>
                        {dateError}
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-row" style={{ marginBottom: 0 }}>
                  <div className="form-group" style={{ marginBottom: form.preferred_time_from && form.preferred_time_to ? 12 : 0 }}>
                    <label className="form-label">⏰ الوقت المفضل — من</label>
                    <select
                      className="form-control"
                      value={form.preferred_time_from}
                      onChange={e => setField('preferred_time_from', e.target.value)}
                    >
                      <option value="">-- غير محدد --</option>
                      {['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
                        '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30'].map(t => <option key={t} value={t}>{formatTime12(t)}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: form.preferred_time_from && form.preferred_time_to ? 12 : 0 }}>
                    <label className="form-label">⏰ الوقت المفضل — إلى</label>
                    <select
                      className="form-control"
                      value={form.preferred_time_to}
                      onChange={e => setField('preferred_time_to', e.target.value)}
                    >
                      <option value="">-- غير محدد --</option>
                      {['08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00',
                        '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00'].map(t => <option key={t} value={t}>{formatTime12(t)}</option>)}
                    </select>
                  </div>
                </div>

                {form.preferred_time_from && form.preferred_time_to && (
                  <div className="animate-fade-in" style={{
                    background: 'var(--primary-glow)',
                    border: '1px solid var(--primary)',
                    borderRadius: 8,
                    padding: '7px 12px',
                    fontSize: '0.8rem',
                    color: 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    🕐 سيتم البحث في النطاق الزمني:{' '}
                    <strong dir="ltr" style={{ display: 'inline-block' }}>
                      {formatTime12(form.preferred_time_from)} – {formatTime12(form.preferred_time_to)}
                    </strong>
                  </div>
                )}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">ملاحظات</label>
              <textarea className="form-control" rows={2} placeholder="ملاحظات..." value={form.notes} onChange={e => setField('notes', e.target.value)} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                className="btn btn-primary"
                onClick={fetchSuggestions}
                disabled={(form.time_allocation_mode === 'manual' && !form.preferred_day && !form.is_full_day) || loadingSugg}
              >
                {loadingSugg ? <><span className="spinner spinner-sm"></span> جاري البحث...</> : (form.is_full_day && form.booking_scope === 'all_university') ? '📌 تجهيز حجز الجامعة' : '🔍 اقتراح أوقات متاحة'}
              </button>
              <button className="btn btn-secondary" onClick={handleSaveRequest}>
                💾 حفظ الطلب فقط
              </button>
            </div>
          </div>

          {/* Detected Sections Card */}
          {courseSections.length > 0 && (
            <div className="card mt-3">
              <h3 className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>👥 الشعب المكتشفة</span>
                <span className="badge badge-info">{courseSections.length} شعبة</span>
              </h3>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setSelectedSections(courseSections.map(s => s.section_key))}>
                  تحديد الكل
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setSelectedSections([])}>
                  إلغاء التحديد
                </button>
              </div>
              
              <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
                <table style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-lighter)', zIndex: 1 }}>
                    <tr>
                      <th style={{ width: 40, textAlign: 'center' }}>☑️</th>
                      <th>الشعبة</th>
                      <th>المحاضر</th>
                      <th>الطلاب</th>
                      <th>المحاضرات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courseSections.map(s => (
                      <tr key={s.section_key} style={{ background: selectedSections.includes(s.section_key) ? 'var(--primary-glow)' : 'transparent' }}>
                        <td style={{ textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={selectedSections.includes(s.section_key)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSections(prev => [...prev, s.section_key]);
                              } else {
                                setSelectedSections(prev => prev.filter(k => k !== s.section_key));
                              }
                            }}
                            style={{ transform: 'scale(1.2)' }}
                          />
                        </td>
                        <td style={{ fontWeight: 600 }}>{s.section_number}</td>
                        <td>{s.instructor_name || '-'}</td>
                        <td>
                          <span className="badge badge-gray">{s.student_count}</span>
                        </td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {s.days_times?.map((dt, idx) => (
                            <div key={idx}>{dt}</div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, padding: 10, background: 'var(--bg-lighter)', borderRadius: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>الشعب المحددة: <strong>{selectedSections.length}</strong></span>
                <span>إجمالي الطلاب: <strong style={{ color: 'var(--accent)' }}>{form.student_count} طالب</strong></span>
              </div>
            </div>
          )}

          {/* Free slots table for the selected day */}
          {form.time_allocation_mode === 'manual' && form.preferred_day && (
            <div className="card mt-3 animate-fade-in">
              <div className="card-header">
                <h3 className="card-title">
                  📅 الأوقات الحرة — {DAY_AR[form.preferred_day]} ({getFacultyLabel(form.faculty)})
                </h3>
                {loadingSlots && <span className="spinner spinner-sm"></span>}
              </div>
              {Object.keys(slotsByRoom).length === 0 && !loadingSlots ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  لا توجد أوقات حرة تطابق هذا الطلب. الرجاء رفع جدول محاضرات أولاً.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '0.82rem' }}>
                    <thead>
                      <tr>
                        <th>المختبر</th>
                        <th>سعة المختبر</th>
                        <th>الأوقات الحرة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(slotsByRoom).map(([room, slots]) => {
                        const info = LAB_INFO[room] || {};
                        const cap = info.capacity || slots[0]?.capacity || '?';
                        const studentFit = !form.student_count || parseInt(form.student_count) <= cap;
                        return (
                          <tr key={room} style={{ opacity: studentFit ? 1 : 0.5 }}>
                            <td>
                              <span style={{ fontWeight: 700, color: 'var(--accent)' }}>🖥️ {room}</span>
                              {info.building && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{info.building} - ط{info.floor}</div>}
                            </td>
                            <td>
                              <span style={{
                                color: studentFit ? 'var(--success)' : 'var(--danger)',
                                fontWeight: 600,
                              }}>
                                {cap} طالب
                              </span>
                              {!studentFit && <div style={{ fontSize: '0.7rem', color: 'var(--danger)' }}>⚠️ السعة غير كافية</div>}
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {slots.map((s, i) => (
                                  <span key={i} style={{
                                    background: 'var(--success-bg)',
                                    border: '1px solid rgba(34,197,94,0.3)',
                                    borderRadius: 5,
                                    padding: '2px 8px',
                                    color: 'var(--success)',
                                    fontWeight: 600,
                                    fontSize: '0.78rem',
                                  }}>
                                    <span dir="ltr" style={{ display: 'inline-block' }}>{formatTime12(s.available_from)} - {formatTime12(s.available_to)}</span> ({s.duration_minutes}د)
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Selected slot confirmation */}
          {selectedSlot && (
            <div className="card mt-3" style={{ borderColor: 'var(--success)', background: 'var(--success-bg)' }}>
              <h3 style={{ color: 'var(--success)', marginBottom: 12, fontSize: '0.95rem' }}>✅ الوقت المختار للجدولة</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.85rem', marginBottom: 14 }}>
                <Detail label="اليوم" value={DAY_AR[selectedSlot.day] || selectedSlot.day} />
                <Detail label="الوقت" value={<span dir="ltr" style={{ display: 'inline-block' }}>{`${formatTime12(selectedSlot.start_time)} - ${formatTime12(selectedSlot.end_time)}`}</span>} />
                <Detail label="المدة" value={`${selectedSlot.duration_minutes} دقيقة`} />
                <Detail label="المختبر/المختبرات" value={selectedSlot.rooms?.join(' / ')} />
                <Detail label="إجمالي السعة" value={`${selectedSlot.total_capacity} طالب`} />
                <Detail label="النوع" value="🔬 مختبر محوسب" />
              </div>
              <button className="btn btn-success w-full" onClick={handleScheduleExam} disabled={saving}>
                {saving ? 'جاري الحفظ...' : '📌 تأكيد وجدولة الاختبار'}
              </button>

              {conflictDetails.length > 0 && (
                <div className="animate-fade-in" style={{ marginTop: 15, background: 'rgba(239, 68, 68, 0.1)', padding: 12, borderRadius: 8, border: '1px solid var(--danger)' }}>
                  <h4 style={{ color: 'var(--danger)', marginBottom: 8, fontSize: '0.9rem' }}>⚠️ أخطاء التعارض المكتشفة:</h4>
                  <ul style={{ paddingRight: 20, color: 'var(--danger)', fontSize: '0.85rem', margin: 0 }}>
                    {conflictDetails.map((c, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>{c.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {duplicateModal.show && duplicateModal.details && (
                <div className="animate-fade-in" style={{ marginTop: 15, background: 'rgba(239, 68, 68, 0.1)', padding: 15, borderRadius: 8, border: '1px solid var(--danger)' }}>
                  <h4 style={{ color: 'var(--danger)', marginBottom: 10, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>⚠️</span> هل تريد التغيير والاستبدال؟
                  </h4>
                  <p style={{ marginBottom: 12, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                    هذه المادة أو بعض شعبها محجوزة مسبقًا. هل تريد حذف الحجز القديم واستبداله بهذا الوقت الجديد؟
                  </p>
                  
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: 10, borderRadius: 6, marginBottom: 15, fontSize: '0.8rem' }}>
                    <strong>الشعب المتعارضة:</strong> {duplicateModal.details.duplicate_sections?.join(', ')} <br/>
                    <div style={{ marginTop: 6 }}>
                      <strong>الحجوزات القديمة التي سيتم إلغاؤها:</strong>
                      <ul style={{ paddingRight: 15, marginTop: 4, marginBottom: 0 }}>
                        {duplicateModal.details.existing_exams?.map(ex => (
                          <li key={ex.id}>
                            تاريخ {ex.date || ex.day} | 
                            من {formatTime12(ex.start_time)} إلى {formatTime12(ex.end_time)} | 
                            ({ex.rooms?.join(',')})
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-danger" style={{ flex: 1 }} onClick={handleReplaceConfirm} disabled={saving}>
                      {saving ? 'جاري الاستبدال...' : 'نعم، استبدال'}
                    </button>
                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setDuplicateModal({ show: false, details: null })}>
                      لا، تراجع
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Suggestions */}
        <div>
          <div className="card" style={{ minHeight: 200 }}>
            <div className="card-header">
              <h3 className="card-title">🎯 المختبرات المقترحة</h3>
              {suggestions.length > 0 && <span className="badge badge-success">{suggestions.length} اقتراح</span>}
            </div>

            {form.time_allocation_mode === 'manual' && !form.preferred_day ? (
              <div className="empty-state" style={{ padding: '30px 20px' }}>
                <div className="empty-state-icon" style={{ fontSize: '2.5rem' }}>🔬</div>
                <h3>اختر اليوم أولاً</h3>
                <p>حدد اليوم لعرض المختبرات المتاحة في كل المباني</p>
              </div>
            ) : loadingSugg ? (
              <div style={{ padding: 30, textAlign: 'center' }}><div className="spinner"></div></div>
            ) : suggestions.length === 0 ? (
              <div className="empty-state" style={{ padding: '30px 20px' }}>
                <div className="empty-state-icon" style={{ fontSize: '2.5rem' }}>😕</div>
                <h3>لا توجد اقتراحات</h3>
                <p>
                  {(form.time_allocation_mode === 'manual' && !form.preferred_day)
                    ? 'حدد اليوم المفضل أو انقر "اقتراح أوقات متاحة"'
                    : 'لا توجد مختبرات متاحة. جرب يوماً آخر أو ارفع جدول محاضرات أولاً.'}
                </p>
                {rejected.length > 0 && (
                  <div style={{ marginTop: 12, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {rejected.slice(0, 3).map((r, i) => (
                      <div key={i} style={{ marginBottom: 2 }}>⛔ {r.reason}</div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {suggestions.map((s, i) => {
                  const info = s.rooms?.[0] ? LAB_INFO[s.rooms[0]] : null;
                  return (
                    <div
                      key={i}
                      className={`suggestion-card ${i === 0 ? 'top' : ''}`}
                      style={{
                        borderColor: selectedSlot === s ? 'var(--primary)' : undefined,
                        background: selectedSlot === s ? 'var(--primary-glow)' : undefined,
                      }}
                      onClick={() => setSelectedSlot(s)}
                    >
                      <div className="suggestion-rank">
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {i === 0 && <span className="badge badge-success">⭐ الأفضل</span>}
                          <span className="badge badge-gray">#{i + 1}</span>
                          <span className="badge badge-info">{s.duration_minutes}د</span>
                          <span className="badge badge-warning">🔬 مختبر</span>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.rooms?.length} مختبر</span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: '0.82rem' }}>
                        <Detail label="اليوم" value={DAY_AR[s.day] || s.day} />
                        <Detail label="الوقت المتاح" value={<span dir="ltr" style={{ display: 'inline-block' }}>{`${formatTime12(s.start_time)} - ${formatTime12(s.end_time)}`}</span>} />
                        <Detail label="المختبر(ات)" value={s.rooms?.join(' / ')} />
                        <Detail label="السعة الكلية" value={`${s.total_capacity} طالب`} />
                      </div>
                      {info && (
                        <div style={{ marginTop: 6, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          📍 {info.building} · الطابق {info.floor}
                        </div>
                      )}

                      <div style={{ marginTop: 10, textAlign: 'left' }}>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={(e) => { e.stopPropagation(); setSelectedSlot(s); }}
                        >
                          {selectedSlot === s ? '✅ مختار' : '📌 استخدم هذا الوقت'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Exam Requests list */}
      {showRequests && (
        <div className="card mt-4">
          <div className="card-header">
            <h3 className="card-title">📋 طلبات الاختبارات</h3>
          </div>
          {requests.length === 0 ? (
            <div className="empty-state" style={{ padding: 30 }}>
              <p>لا توجد طلبات اختبار بعد</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.83rem' }}>
                <thead>
                  <tr>
                    <th>كود المادة</th>
                    <th>اسم المادة</th>
                    <th>الشعب</th>
                    <th>الطلاب</th>
                    <th>المبنى</th>
                    <th>اليوم/الوقت</th>
                    <th>الحالة</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map(r => {
                    const statusMap = {
                      pending: { label: '⏳ معلق', cls: 'badge-warning' },
                      draft: { label: '📝 مسودة', cls: 'badge-gray' },
                      submitted: { label: '📤 مقدّم', cls: 'badge-info' },
                      pending_department_approval: { label: '🏛 انتظار القسم', cls: 'badge-warning' },
                      department_approved: { label: '✅ موافقة القسم', cls: 'badge-success' },
                      pending_registrar_approval: { label: '🏛 انتظار التسجيل', cls: 'badge-warning' },
                      registrar_approved: { label: '✅ موافقة التسجيل', cls: 'badge-success' },
                      scheduled: { label: '📅 مجدول', cls: 'badge-success' },
                      rejected: { label: '❌ مرفوض', cls: 'badge-danger' },
                      cancelled: { label: '🚫 ملغى', cls: 'badge-danger' },
                    };
                    const s = statusMap[r.status] || { label: r.status, cls: 'badge-gray' };
                    const canSubmit = ['pending', 'draft'].includes(r.status);
                    const canApprove = ['submitted','pending_department_approval','department_approved','pending_registrar_approval'].includes(r.status);
                    const canReject = !['rejected','cancelled','scheduled'].includes(r.status);
                    const canCancel = !['cancelled','scheduled'].includes(r.status);
                    return (
                      <tr key={r.id}>
                        <td style={{ fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700 }}>{r.course_code}</td>
                        <td>{r.course_name || '-'}</td>
                        <td><span className="badge badge-gray">{r.selected_sections_count || '-'} شعبة</span></td>
                        <td><span className="badge badge-info">{r.total_students || r.student_count || 0} طالب</span></td>
                        <td>{getFacultyLabel(r.faculty)}</td>
                        <td style={{ fontSize: '0.78rem' }}>
                          {r.time_allocation_mode === 'manual'
                            ? <span dir="ltr">{DAY_AR[r.preferred_day] || r.preferred_day}<br/>{formatTime12(r.preferred_time_from)} – {formatTime12(r.preferred_time_to)}</span>
                            : <span className="badge badge-primary">تلقائي</span>}
                        </td>
                        <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {canSubmit && (
                              <button className="btn btn-primary btn-sm" onClick={() => handleSubmit(r.id)} title="تقديم للمراجعة">📤</button>
                            )}
                            {canApprove && (
                              <button className="btn btn-success btn-sm" onClick={() => handleApprove(r.id)} title="موافقة">✅</button>
                            )}
                            {canReject && (
                              <button className="btn btn-warning btn-sm" onClick={() => handleReject(r.id)} title="رفض">❌</button>
                            )}
                            {canCancel && (
                              <button className="btn btn-secondary btn-sm" onClick={() => handleCancel(r.id)} title="إلغاء">🚫</button>
                            )}
                            <button className="btn btn-danger btn-sm" onClick={() => deleteRequest(r.id)} title="حذف">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* End of content */}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{value || '-'}</div>
    </div>
  );
}
