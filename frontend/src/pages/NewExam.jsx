import React, { useState, useEffect } from 'react';
import { examsAPI, availabilityAPI } from '../api';
import { useToast } from '../components/Toast';

const DAY_AR = {
  sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء', thursday: 'الخميس', friday: 'الجمعة', saturday: 'السبت',
};

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];

const FACULTY_OPTIONS = [
  { value: '', label: 'كل المختبرات (IT + المكتبة)' },
  { value: 'it', label: 'مبنى IT فقط' },
  { value: 'library', label: 'مبنى المكتبة فقط' },
];

// Lab details for display
const LAB_INFO = {
  '2101': { capacity: 26, building: 'مبنى المكتبة', floor: '1' },
  '2102': { capacity: 26, building: 'مبنى المكتبة', floor: '1' },
  '2103': { capacity: 26, building: 'مبنى المكتبة', floor: '1' },
  '2104': { capacity: 26, building: 'مبنى المكتبة', floor: '1' },
  '2105': { capacity: 26, building: 'مبنى المكتبة', floor: '1' },
  '2106': { capacity: 26, building: 'مبنى المكتبة', floor: '1' },
  '2107': { capacity: 35, building: 'مبنى المكتبة', floor: '1' },
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
};

export default function NewExam() {
  const toast = useToast();
  const [form, setForm] = useState({
    course_code: '', course_name: '', section: '', lecturer: '',
    student_count: '', faculty: '', preferred_day: '', preferred_date: '',
    duration_minutes: '60', notes: '',
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

  useEffect(() => { loadRequests(); }, []);

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
  }

  async function fetchFreeSlots() {
    if (!form.preferred_day) return;
    setLoadingSlots(true);
    try {
      const params = {
        day: form.preferred_day,
        duration: form.duration_minutes ? parseInt(form.duration_minutes) : 60,
        studentCount: form.student_count ? parseInt(form.student_count) : 0,
        roomType: 'lab',
      };
      if (form.faculty) params.faculty = form.faculty;
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
        day: form.preferred_day || null,
        duration: form.duration_minutes ? parseInt(form.duration_minutes) : null,
        studentCount: form.student_count ? parseInt(form.student_count) : 0,
        lecturer: form.lecturer || null,
        roomType: 'lab',
      });
      setSuggestions(result.suggestions || []);
      setRejected(result.rejected || []);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoadingSugg(false);
    }
  }

  async function handleSaveRequest() {
    if (!form.faculty) return toast('يجب تحديد المبنى', 'warning');
    if (!form.course_code) return toast('يجب إدخال كود المادة', 'warning');
    try {
      await examsAPI.createRequest({
        ...form,
        student_count: parseInt(form.student_count) || 0,
        duration_minutes: parseInt(form.duration_minutes) || 60,
        room_type_preference: 'lab',
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
    setSaving(true);
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
        student_count: parseInt(form.student_count) || 0,
        course_code: form.course_code,
        course_name: form.course_name,
        section: form.section,
      });
      toast('✅ تم جدولة الاختبار بنجاح!', 'success');
      setForm({
        course_code: '', course_name: '', section: '', lecturer: '',
        student_count: '', faculty: '', preferred_day: '', preferred_date: '',
        duration_minutes: '60', notes: '',
      });
      setSuggestions([]);
      setSelectedSlot(null);
      setFreeSlots([]);
      loadRequests();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
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
                <input type="text" className="form-control" placeholder="مثال: CS121" value={form.course_code} onChange={e => setField('course_code', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">اسم المادة</label>
                <input type="text" className="form-control" placeholder="اسم المادة" value={form.course_name} onChange={e => setField('course_name', e.target.value)} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">الشعبة</label>
                <input type="text" className="form-control" placeholder="مثال: 1" value={form.section} onChange={e => setField('section', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">المحاضر</label>
                <input type="text" className="form-control" placeholder="اسم المحاضر" value={form.lecturer} onChange={e => setField('lecturer', e.target.value)} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">المبنى / الكلية</label>
                <select className="form-control" value={form.faculty} onChange={e => setField('faculty', e.target.value)}>
                  {FACULTY_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">عدد الطلاب *</label>
                <input type="number" className="form-control" placeholder="عدد طلاب الاختبار" min="0" value={form.student_count} onChange={e => setField('student_count', e.target.value)} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">اليوم المفضل *<span style={{color:'var(--danger)'}}>*</span></label>
                <select className="form-control" value={form.preferred_day} onChange={e => setField('preferred_day', e.target.value)}>
                  <option value="">-- اختر اليوم --</option>
                  {DAYS.map(d => <option key={d} value={d}>{DAY_AR[d]}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">مدة الاختبار (دقيقة)</label>
                <select className="form-control" value={form.duration_minutes} onChange={e => setField('duration_minutes', e.target.value)}>
                  <option value="60">60 دقيقة (ساعة)</option>
                  <option value="90">90 دقيقة (ساعة ونصف)</option>
                  <option value="120">120 دقيقة (ساعتان)</option>
                  <option value="150">150 دقيقة</option>
                  <option value="180">180 دقيقة (3 ساعات)</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">التاريخ المفضل (اختياري)</label>
                <input type="date" className="form-control" value={form.preferred_date} onChange={e => setField('preferred_date', e.target.value)} />
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

            <div className="form-group">
              <label className="form-label">ملاحظات</label>
              <textarea className="form-control" rows={2} placeholder="ملاحظات..." value={form.notes} onChange={e => setField('notes', e.target.value)} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                className="btn btn-primary"
                onClick={fetchSuggestions}
                disabled={!form.preferred_day || loadingSugg}
              >
                {loadingSugg ? <><span className="spinner spinner-sm"></span> جاري البحث...</> : '🔍 اقتراح أوقات متاحة'}
              </button>
              <button className="btn btn-secondary" onClick={handleSaveRequest}>
                💾 حفظ الطلب فقط
              </button>
            </div>
          </div>

          {/* Free slots table for the selected day */}
          {form.preferred_day && (
            <div className="card mt-3">
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
                                    <span dir="ltr" style={{ display: 'inline-block' }}>{s.available_from} - {s.available_to}</span> ({s.duration_minutes}د)
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
                <Detail label="الوقت" value={<span dir="ltr" style={{ display: 'inline-block' }}>{`${selectedSlot.start_time} - ${selectedSlot.end_time}`}</span>} />
                <Detail label="المدة" value={`${selectedSlot.duration_minutes} دقيقة`} />
                <Detail label="المختبر/المختبرات" value={selectedSlot.rooms?.join(' / ')} />
                <Detail label="إجمالي السعة" value={`${selectedSlot.total_capacity} طالب`} />
                <Detail label="النوع" value="🔬 مختبر محوسب" />
              </div>
              <button className="btn btn-success w-full" onClick={handleScheduleExam} disabled={saving}>
                {saving ? 'جاري الحفظ...' : '📌 تأكيد وجدولة الاختبار'}
              </button>
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

            {!form.preferred_day ? (
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
                  {!form.preferred_day
                    ? 'حدد اليوم المفضل أو انقر "اقتراح أوقات متاحة"'
                    : 'لا توجد مختبرات متاحة لهذا اليوم. جرب يوماً آخر أو ارفع جدول محاضرات أولاً.'}
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
                        <Detail label="الوقت المتاح" value={<span dir="ltr" style={{ display: 'inline-block' }}>{`${s.start_time} - ${s.end_time}`}</span>} />
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
            <table>
              <thead>
                <tr>
                  <th>كود المادة</th>
                  <th>اسم المادة</th>
                  <th>الشعبة</th>
                  <th>المبنى</th>
                  <th>اليوم</th>
                  <th>المدة</th>
                  <th>الطلاب</th>
                  <th>الحالة</th>
                  <th>حذف</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{r.course_code}</td>
                    <td>{r.course_name || '-'}</td>
                    <td>{r.section || '-'}</td>
                    <td>{getFacultyLabel(r.faculty)}</td>
                    <td>{DAY_AR[r.preferred_day] || r.preferred_day || '-'}</td>
                    <td>{r.duration_minutes}د</td>
                    <td>{r.student_count}</td>
                    <td>
                      <span className={`badge badge-${r.status === 'scheduled' ? 'success' : 'warning'}`}>
                        {r.status === 'scheduled' ? '✅ مجدول' : '⏳ معلق'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteRequest(r.id)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
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
