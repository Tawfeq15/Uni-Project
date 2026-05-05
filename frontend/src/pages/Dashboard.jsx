import React, { useState, useEffect, useCallback } from 'react';
import { dashboardAPI, availabilityAPI, conflictsAPI, scheduleAPI } from '../api';

// Convert 24h time string to 12h (e.g. "14:00" → "2:00", "16:00" → "4:00")
function to12h(t) {
  if (!t) return '';
  const [h, m] = t.substring(0, 5).split(':').map(Number);
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2,'0')}`;
}

// Fixed time slots by day type
const TIME_SLOTS = {
  mon_wed: [
    { start: '08:00', end: '09:30' },
    { start: '09:30', end: '11:00' },
    { start: '11:00', end: '12:30' },
    { start: '12:30', end: '14:00' },
    { start: '14:00', end: '15:30' },
  ],
  // Sun / Tue / Thu
  sun_tue_thu: [
    { start: '08:00', end: '09:00' },
    { start: '09:00', end: '10:00' },
    { start: '10:00', end: '11:00' },
    { start: '11:00', end: '12:00' },
    { start: '12:00', end: '13:00' },
    { start: '13:00', end: '14:00' },
    { start: '14:00', end: '15:00' },
    { start: '15:00', end: '16:00' },
  ],
};

function getSlotType(day) {
  if (['monday','wednesday'].includes(day))          return 'mon_wed';
  if (['sunday','tuesday','thursday'].includes(day)) return 'sun_tue_thu';
  return null;
}

// Group sessions into their matching fixed slot
function groupBySlots(sessions, day) {
  const slotType = getSlotType(day);
  if (!slotType) {
    // Other days: group by their actual start_time
    const map = {};
    sessions.forEach(s => {
      const key = s.start_time?.substring(0,5) + ' - ' + s.end_time?.substring(0,5);
      if (!map[key]) map[key] = { start: s.start_time?.substring(0,5), end: s.end_time?.substring(0,5), sessions: [] };
      map[key].sessions.push(s);
    });
    return Object.values(map);
  }
  return TIME_SLOTS[slotType]
    .map(slot => ({
      ...slot,
      sessions: sessions.filter(s => {
        const st = s.start_time?.substring(0, 5) || '';
        return st >= slot.start && st < slot.end;
      }),
    }))
    .filter(slot => slot.sessions.length > 0);
}

// Return the current time-slot for today based on fixed schedule
function getCurrentSlot(day) {
  const slotType = getSlotType(day);
  if (!slotType) return null;
  const now = new Date();
  const t = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  return TIME_SLOTS[slotType].find(s => t >= s.start && t < s.end) || null;
}

function getNextWorkingDay(date) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  while (next.getDay() === 5 || next.getDay() === 6) { // Skip Friday, Saturday
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function getCurrentAndNextSlot() {
  const now = new Date();
  const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const currentDayStr = dayNames[now.getDay()];
  const currentTime = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  
  let currentSlot = null;
  let nextSlot = null;
  let nextSlotDate = new Date(now);

  const slotType = getSlotType(currentDayStr);
  if (slotType) {
    const slots = TIME_SLOTS[slotType];
    const currentIndex = slots.findIndex(s => currentTime >= s.start && currentTime < s.end);
    
    if (currentIndex !== -1) {
      currentSlot = { ...slots[currentIndex], date: now };
      if (currentIndex + 1 < slots.length) {
        nextSlot = { ...slots[currentIndex + 1], date: now };
      } else {
        nextSlotDate = getNextWorkingDay(now);
        const nextSlotType = getSlotType(dayNames[nextSlotDate.getDay()]);
        if (nextSlotType) nextSlot = { ...TIME_SLOTS[nextSlotType][0], date: nextSlotDate };
      }
    } else {
      const nextIndex = slots.findIndex(s => currentTime < s.start);
      if (nextIndex !== -1) {
        nextSlot = { ...slots[nextIndex], date: now };
      } else {
        nextSlotDate = getNextWorkingDay(now);
        const nextSlotType = getSlotType(dayNames[nextSlotDate.getDay()]);
        if (nextSlotType) nextSlot = { ...TIME_SLOTS[nextSlotType][0], date: nextSlotDate };
      }
    }
  } else {
    nextSlotDate = getNextWorkingDay(now);
    const nextSlotType = getSlotType(dayNames[nextSlotDate.getDay()]);
    if (nextSlotType) nextSlot = { ...TIME_SLOTS[nextSlotType][0], date: nextSlotDate };
  }

  return { currentSlot, nextSlot };
}

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area,
} from 'recharts';
import { useNavigate } from 'react-router-dom';

const DAY_AR = {
  sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء', thursday: 'الخميس',
};

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [todaySlots, setTodaySlots] = useState([]);
  const [allLabsSlots, setAllLabsSlots] = useState([]);
  const [currentHourWindow, setCurrentHourWindow] = useState('');
  const [weeklyAvailability, setWeeklyAvailability] = useState([]);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [todayExams, setTodayExams] = useState([]);
  const [allLabs, setAllLabs] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [activeSessionsTime, setActiveSessionsTime] = useState('');
  const [sessionViewMode, setSessionViewMode] = useState('current'); // 'current' | 'all'
  const [examViewMode, setExamViewMode] = useState('current'); // 'current' | 'all'
  const [examDate, setExamDate] = useState(null); // actual date of shown exams
  const navigate = useNavigate();

  const updateLiveTime = useCallback((slotsData, examsData, labsData) => {
    const dataToUse = slotsData || allLabsSlots;
    const examsToUse = examsData || todayExams;
    const labsToUse = labsData || allLabs;
    if (!dataToUse.length) return;
    
    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    
    const todayStr = now.toISOString().split('T')[0];
    const exactMinStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    
    const todayDay = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][now.getDay()];
    const slot = getCurrentSlot(todayDay);
    if (slot) {
      setCurrentHourWindow(`${to12h(slot.start)} - ${to12h(slot.end)}`);
    } else {
      setCurrentHourWindow(`-`);
    }
    
    const freeNow = dataToUse.filter(s => {
      if (s.day !== todayDay) return false;
      // Check if the room is strictly free at this exact minute
      return s.available_from <= exactMinStr && s.available_to > exactMinStr;
    });

    const examsNow = examsToUse.filter(e => {
      if (e.day !== todayDay) return false;
      if (!e.start_time || !e.end_time) return false;
      const sStr = e.start_time.substring(0, 5);
      const eStr = e.end_time.substring(0, 5);
      return sStr <= exactMinStr && eStr > exactMinStr;
    });

    const displaySlots = [];
    freeNow.forEach(s => {
      displaySlots.push({ room: s.room, status: 'free' });
    });

    examsNow.forEach(e => {
      const rooms = e.rooms || [];
      rooms.forEach(roomName => {
        // Only add if it's a lab
        const isLab = labsToUse.some(l => l.room_name === roomName);
        if (isLab) {
          displaySlots.push({ room: roomName, status: 'exam', exam: e });
        }
      });
    });

    setTodaySlots(displaySlots.slice(0, 6));
  }, [allLabsSlots, todayExams, allLabs]);

  useEffect(() => {
    const interval = setInterval(() => {
      updateLiveTime();
      // Also refresh active sessions every minute
      availabilityAPI.activeSessions('it_library')
        .then(r => setActiveSessions(r.sessions || []))
        .catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [updateLiveTime]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await dashboardAPI.stats();
      setStats(data);

      // Load weekly availability overview
      try {
        const slots = await availabilityAPI.freeSlots({ roomType: 'lab' });
        const allSlots = slots.slots || [];

        // Group by day
        const byDay = {};
        DAYS.forEach(d => { byDay[d] = { free: 0, occupied: 0 }; });
        allSlots.forEach(s => {
          if (byDay[s.day]) byDay[s.day].free++;
        });

        setWeeklyAvailability(DAYS.map(d => ({
          day: DAY_AR[d],
          'فترات حرة': byDay[d]?.free || 0,
        })));

        // Today's free labs
        setAllLabsSlots(allSlots);
        
        // Fetch all labs and today's exams for live status
        const todayDay = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()];
        const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const nextDaysDate = new Date();
        nextDaysDate.setDate(nextDaysDate.getDate() + 4);
        const nextDaysStr = nextDaysDate.toISOString().split('T')[0];

        const [roomsRes, examsRes] = await Promise.all([
          availabilityAPI.rooms('it_library'),
          scheduleAPI.list({ date_from: todayDate, date_to: nextDaysStr })  // fetch up to 4 days ahead
        ]);
        
        const labs = roomsRes.rooms || roomsRes || [];
        const exams = examsRes.exams || examsRes || [];

        setAllLabs(labs);
        setTodayExams(exams);
        setExamDate(todayDate);
        
        updateLiveTime(allSlots, exams, labs);

        // Load active sessions (lectures running RIGHT NOW)
        try {
          const activeRes = await availabilityAPI.activeSessions('it_library');
          setActiveSessions(activeRes.sessions || []);
          setActiveSessionsTime(activeRes.time_now || '');
        } catch { /* ignore */ }
      } catch { /* ignore */ }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleReset() {
    if (!resetConfirm) {
      setResetConfirm(true);
      setTimeout(() => setResetConfirm(false), 5000);
      return;
    }
    try {
      setLoading(true);
      setResetConfirm(false);
      const res = await dashboardAPI.reset();
      if (res.success) {
        alert('تم تفريغ النظام بنجاح.');
        load();
      }
    } catch (e) {
      alert('خطأ أثناء المسح: ' + e.message);
      setLoading(false);
    }
  }

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>جاري تحميل لوحة التحكم...</div>
      </div>
    </div>
  );

  if (error) return (
    <div className="page">
      <div className="alert alert-danger">❌ {error}</div>
    </div>
  );

  const totalRooms = (stats.total_rooms || 0) + (stats.total_labs || 0);
  const utilizationRate = stats.scheduled_exams > 0
    ? Math.min(100, Math.round((stats.scheduled_exams / Math.max(stats.exam_requests, 1)) * 100))
    : 0;

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 لوحة التحكم</h1>
          <p className="page-subtitle">مركز إدارة جدولة الاختبارات — نظرة شاملة على الحالة الراهنة</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {/* Date + Day badge */}
            <div style={{
              background: 'linear-gradient(135deg, var(--primary), var(--accent))',
              borderRadius: 10,
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 2px 12px rgba(99,102,241,0.25)',
            }}>
              <span style={{ fontSize: '1.1rem' }}>📅</span>
             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', lineHeight: 1 }}>
                  {new Date().toLocaleDateString('ar-SA', { weekday: 'long' })}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.75rem' }} dir="ltr">
                  {new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
                {examDate && examDate !== new Date().toISOString().split('T')[0] && (
                  <span style={{ color: '#fde68a', fontSize: '0.7rem', fontWeight: 600 }}>
                    ⚠️ الامتحانات بتاريخ {new Date(examDate).toLocaleDateString('ar-SA', { day: 'numeric', month: 'long' })}
                  </span>
                )}
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={load}>🔄 تحديث</button>
            <button
              className={`btn btn-sm ${resetConfirm ? 'btn-danger' : 'btn-secondary'}`}
              onClick={handleReset}
              title={resetConfirm ? 'انقر مرة أخرى للتأكيد!' : 'إفراغ النظام'}
              style={{ transition: 'all 0.3s' }}
            >
              {resetConfirm ? '⚠️ تأكيد الحذف الكامل؟' : '🗑️ إفراغ النظام'}
            </button>
          </div>
        </div>
      </div>

      {/* Alert if no data */}
      {stats.uploaded_files === 0 && (
        <div className="alert alert-info mb-4" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.4rem' }}>📭</span>
          <div>
            <strong>النظام فارغ</strong> — لم يتم رفع أي ملفات بعد.{' '}
            <span
              onClick={() => navigate('/uploads')}
              style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline', fontWeight: 700 }}
            >
              ابدأ برفع جدول المحاضرات
            </span>
          </div>
        </div>
      )}

      {/* KPI Cards Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 14,
        marginBottom: 24,
      }}>
        <KpiCard
          icon="📁"
          label="ملفات نشطة"
          value={stats.uploaded_files}
          subtitle={`من ${stats.total_files || 0} إجمالي`}
          color="var(--primary)"
          onClick={() => navigate('/uploads')}
        />
        <KpiCard
          icon="🏫"
          label="إجمالي القاعات"
          value={totalRooms}
          subtitle={`${stats.total_labs || 0} مختبر، ${stats.total_rooms || 0} قاعة`}
          color="var(--info)"
          onClick={() => navigate('/availability')}
        />
        <KpiCard
          icon="📝"
          label="طلبات الاختبار"
          value={stats.exam_requests || 0}
          subtitle="إجمالي الطلبات"
          color="var(--warning)"
          onClick={() => navigate('/new-exam')}
        />
        <KpiCard
          icon="✅"
          label="اختبارات مجدولة"
          value={stats.scheduled_exams || 0}
          subtitle={`${utilizationRate}% من الطلبات`}
          color="var(--success)"
          onClick={() => navigate('/schedule')}
        />
        <KpiCard
          icon="⏳"
          label="غير مجدولة"
          value={stats.unscheduled_exams || 0}
          subtitle="بانتظار الجدولة"
          color={stats.unscheduled_exams > 0 ? 'var(--warning)' : 'var(--success)'}
          onClick={() => navigate('/new-exam')}
        />
        <KpiCard
          icon="⚠️"
          label="تعارضات"
          value={stats.conflicts || 0}
          subtitle={stats.conflicts > 0 ? 'تحتاج مراجعة' : 'لا تعارضات'}
          color={stats.conflicts > 0 ? 'var(--danger)' : 'var(--success)'}
          onClick={() => navigate('/conflicts')}
          pulse={stats.conflicts > 0}
        />
      </div>


      {/* ── Row 1: Free Labs | Quick Actions ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Today's Free Labs ─ derived from activeSessions (same source as the occupancy panel) */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              🔬 مختبرات حرة الآن
              {(() => {
                const dn = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()];
                const sl = getCurrentSlot(dn);
                return sl
                  ? <span className="badge badge-primary" dir="ltr">{to12h(sl.start)} - {to12h(sl.end)}</span>
                  : null;
              })()}
            </h3>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/availability')}>
              تفاصيل ←
            </button>
          </div>
          {(() => {
            const dn       = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()];
            const todayStr = new Date().toISOString().split('T')[0];
            const slot     = getCurrentSlot(dn);
            const exactNow = (() => {
              const n = new Date();
              return n.getHours().toString().padStart(2,'0') + ':' + n.getMinutes().toString().padStart(2,'0');
            })();

            // Rooms occupied by lectures right now
            const occupiedByLecture = new Set(
              activeSessions
                .filter(s => {
                  const st = s.start_time?.substring(0,5) || '';
                  const et = s.end_time?.substring(0,5) || '';
                  if (!slot) return true;
                  return st <= exactNow && et > exactNow;
                })
                .map(s => s.room)
            );

            // Rooms occupied by exams right now
            const examOccupiedMap = {}; // room → exam
            todayExams.forEach(e => {
              if (e.exam_date !== todayStr) return;
              if (!e.start_time || !e.end_time) return;
              const sStr = e.start_time.substring(0,5);
              const eStr = e.end_time.substring(0,5);
              if (sStr <= exactNow && eStr > exactNow) {
                (e.rooms || []).forEach(r => { examOccupiedMap[r] = e; });
              }
            });
            const occupiedByExam = new Set(Object.keys(examOccupiedMap));

            // All known labs
            const allRooms = allLabs.length > 0
              ? [...new Set(allLabs.map(l => l.room_name || l.name || l.room))].filter(Boolean).sort()
              : [...new Set(activeSessions.map(s => s.room))].sort();

            // Free = not occupied by lecture AND not occupied by exam
            const freeRooms = slot
              ? allRooms.filter(r => !occupiedByLecture.has(r) && !occupiedByExam.has(r))
              : [];

            if (!slot) return (
              <div className="empty-state" style={{ padding: '30px 20px' }}>
                <div className="empty-state-icon">⏰</div>
                <p style={{ fontSize: '0.82rem' }}>لا توجد فترة دراسية حالياً</p>
              </div>
            );
            if (freeRooms.length === 0) return (
              <div className="empty-state" style={{ padding: '30px 20px' }}>
                <div className="empty-state-icon">🔴</div>
                <p style={{ fontSize: '0.82rem' }}>جميع المختبرات مشغولة في هذه الفترة</p>
              </div>
            );
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {freeRooms.map((room, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', background: 'var(--success-bg)',
                    border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, fontSize: '0.82rem',
                  }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>🖥️ {room}</span>
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>متاحة الآن</span>
                    <span className="badge badge-success" style={{ visibility: 'hidden' }}>-</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>


        {/* Exams Table (Split View) */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              📝 جدول الامتحانات
            </h3>
            <div style={{ display: 'flex', gap: 6, background: 'var(--bg-lighter)', padding: 4, borderRadius: 6 }}>
              <button
                className={`btn btn-sm ${examViewMode === 'current' ? 'btn-primary' : ''}`}
                style={{ background: examViewMode === 'current' ? '' : 'transparent', color: examViewMode === 'current' ? '' : 'var(--text-secondary)' }}
                onClick={() => setExamViewMode('current')}
              >عرض الفترات</button>
              <button
                className={`btn btn-sm ${examViewMode === 'all' ? 'btn-primary' : ''}`}
                style={{ background: examViewMode === 'all' ? '' : 'transparent', color: examViewMode === 'all' ? '' : 'var(--text-secondary)' }}
                onClick={() => setExamViewMode('all')}
              >كل اليوم</button>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(() => {
              if (examViewMode === 'all') {
                const todayStr = new Date().toISOString().split('T')[0];
                const displayExams = todayExams
                  .filter(e => e.exam_date === todayStr)
                  .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

                if (displayExams.length === 0) {
                  return (
                    <div className="empty-state" style={{ padding: '30px 20px', flex: 1 }}>
                      <div className="empty-state-icon">✅</div>
                      <p style={{ fontSize: '0.82rem' }}>لا توجد امتحانات متبقية اليوم</p>
                    </div>
                  );
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {displayExams.map((e, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 12px', background: 'rgba(99,102,241,0.05)',
                        border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8, fontSize: '0.82rem',
                      }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)', minWidth: 110, flexShrink: 0 }}>
                          <span dir="ltr">{to12h(e.start_time)} - {to12h(e.end_time)}</span>
                        </span>
                        <span style={{ flex: 1.5, fontWeight: 600, color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.course_name || e.course_code}
                        </span>
                        <span style={{ flex: 1, textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {(e.rooms || []).join('، ')}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              } else {
                // Split view (Current & Next)
                const { currentSlot, nextSlot } = getCurrentAndNextSlot();
                
                const renderSlotExams = (slot, title, isNext) => {
                  if (!slot) {
                    return (
                      <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)', borderRadius: 8, padding: 15, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>لا توجد فترة {isNext ? 'قادمة' : 'حالية'}</span>
                      </div>
                    );
                  }
                  
                  const slotDateStr = slot.date.toISOString().split('T')[0];
                  const slotExams = todayExams.filter(e => {
                    const st = e.start_time?.substring(0,5) || '';
                    return e.exam_date === slotDateStr && st >= slot.start && st < slot.end;
                  }).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

                  const slotDayName = DAY_AR[['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][slot.date.getDay()]];

                  return (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isNext ? 'var(--warning)' : 'var(--primary)' }}>
                          {title} {isNext && slotDateStr !== new Date().toISOString().split('T')[0] ? `(${slotDayName})` : ''}
                        </span>
                        <span className={`badge ${isNext ? 'badge-warning' : 'badge-primary'}`} dir="ltr">{to12h(slot.start)} - {to12h(slot.end)}</span>
                      </div>
                      
                      <div style={{ flex: 1, overflowY: 'auto' }}>
                        {slotExams.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '15px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                            لا يوجد امتحانات
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {slotExams.map((e, i) => (
                              <div key={i} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '6px 10px', background: isNext ? 'rgba(245, 158, 11, 0.05)' : 'rgba(99,102,241,0.05)',
                                border: `1px solid ${isNext ? 'rgba(245, 158, 11, 0.15)' : 'rgba(99,102,241,0.15)'}`, borderRadius: 6, fontSize: '0.8rem',
                              }}>
                                <span style={{ flex: 1.5, fontWeight: 600, color: isNext ? 'var(--warning)' : 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {e.course_name || e.course_code}
                                </span>
                                <span style={{ flex: 1, textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {(e.rooms || []).join('، ')}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                };

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 15 }}>
                    {renderSlotExams(currentSlot, 'الفترة الحالية', false)}
                    {renderSlotExams(nextSlot, 'الفترة القادمة (للتجهيز)', true)}
                  </div>
                );
              }
            })()}
          </div>
        </div>
      </div>

      {/* ── Row 2: Lab Occupancy (full width, same design) ── */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            📚 اشغال المختبرات
            {sessionViewMode === 'all' ? (
              <span className="badge badge-warning" dir="ltr">08:00 - 16:00</span>
            ) : (() => {
              const dn = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()];
              const sl = getCurrentSlot(dn);
              return sl
                ? <span className="badge badge-warning" dir="ltr">{to12h(sl.start)} - {to12h(sl.end)}</span>
                : null;
            })()}
          </h3>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden', fontSize: '0.75rem' }}>
              <button
                onClick={() => setSessionViewMode('current')}
                style={{ padding: '4px 10px', background: sessionViewMode === 'current' ? 'var(--primary)' : 'transparent', color: sessionViewMode === 'current' ? '#fff' : 'var(--text-muted)', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              >الفترة الحالية</button>
              <button
                onClick={() => setSessionViewMode('all')}
                style={{ padding: '4px 10px', background: sessionViewMode === 'all' ? 'var(--primary)' : 'transparent', color: sessionViewMode === 'all' ? '#fff' : 'var(--text-muted)', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              >الكل</button>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/availability')}>تفاصيل ←</button>
          </div>
        </div>

        {(() => {
          const todayStr  = new Date().toISOString().split('T')[0];
          const todayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()];
          const nowStr    = new Date().toTimeString().slice(0, 5);
          const slot      = getCurrentSlot(todayName);

          // Build exam-occupied map for right now
          const examOccupiedNow = {}; // room → exam
          todayExams.forEach(e => {
            if (e.exam_date !== todayStr || !e.start_time || !e.end_time) return;
            const sStr = e.start_time.substring(0,5);
            const eStr = e.end_time.substring(0,5);
            if (sStr <= nowStr && eStr > nowStr) {
              (e.rooms || []).forEach(r => {
                if (allLabs.some(l => (l.room_name || l.name || l.room) === r)) {
                  examOccupiedNow[r] = e;
                }
              });
            }
          });

          // Session row renderer
          const SessionRow = ({ s }) => (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '7px 14px', gap: 12,
              background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)',
              borderRadius: 7, fontSize: '0.81rem',
            }}>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)', minWidth: 52, flexShrink: 0 }}>🖥️ {s.room}</span>
              <span style={{ flex: 1.5, fontWeight: 600, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.course_name || s.course_code || '—'}</span>
              <span style={{ flex: 1, color: 'var(--text-secondary)', fontSize: '0.77rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                👨‍🏫 {s.lecturer || '—'}{s.section && <span style={{ color: 'var(--text-muted)', marginRight: 4 }}> · ش {s.section}</span>}
              </span>
            </div>
          );

          // Exam row renderer
          const ExamRow = ({ room, exam }) => (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '7px 14px', gap: 12,
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: 7, fontSize: '0.81rem',
            }}>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)', minWidth: 52, flexShrink: 0 }}>📝 {room}</span>
              <span style={{ flex: 1.5, fontWeight: 600, color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {exam.course_name || exam.course_code || '—'}
              </span>
              <span style={{ flex: 1, fontSize: '0.77rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>امتحان</span>
                {' '}{exam.start_time?.substring(0,5)} - {exam.end_time?.substring(0,5)}
              </span>
            </div>
          );

          if (sessionViewMode === 'all') {
            const grouped = groupBySlots(activeSessions, todayName);

            // Also build exam sessions grouped by time for all-day view
            const allDayExamRooms = {};
            todayExams.forEach(e => {
              if (e.exam_date !== todayStr || !e.start_time || !e.end_time) return;
              const key = `${e.start_time.substring(0,5)}-${e.end_time.substring(0,5)}`;
              if (!allDayExamRooms[key]) allDayExamRooms[key] = { start: e.start_time.substring(0,5), end: e.end_time.substring(0,5), exams: [] };
              (e.rooms || []).forEach(r => {
                if (allLabs.some(l => (l.room_name || l.name || l.room) === r)) {
                  allDayExamRooms[key].exams.push({ room: r, exam: e });
                }
              });
            });

            const hasAnything = grouped.length > 0 || Object.keys(allDayExamRooms).length > 0;
            if (!hasAnything) return (
              <div className="empty-state" style={{ padding: '30px 20px' }}>
                <div className="empty-state-icon">✅</div>
                <p style={{ fontSize: '0.82rem' }}>لا توجد محاضرات أو امتحانات في مختبرات IT والمكتبة اليوم</p>
              </div>
            );

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {grouped.map((slotG, si) => (
                  <div key={si}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.82rem', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 6, padding: '2px 10px', color: 'var(--danger)' }}>
                        <span dir="ltr">{to12h(slotG.start)} - {to12h(slotG.end)}</span>
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({slotG.sessions.length} قاعة)</span>
                      <div style={{ flex: 1, height: 1, background: 'rgba(239,68,68,0.15)' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {slotG.sessions.map((s, i) => <SessionRow key={i} s={s} />)}
                    </div>
                  </div>
                ))}
                {Object.values(allDayExamRooms).map((eg, ei) => (
                  <div key={'ex-' + ei}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.82rem', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 6, padding: '2px 10px', color: 'var(--primary)' }}>
                        <span dir="ltr">{to12h(eg.start)} - {to12h(eg.end)}</span>
                      </span>
                      <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>امتحان</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({eg.exams.length} قاعة)</span>
                      <div style={{ flex: 1, height: 1, background: 'rgba(99,102,241,0.15)' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {eg.exams.map((item, i) => <ExamRow key={i} room={item.room} exam={item.exam} />)}
                    </div>
                  </div>
                ))}
              </div>
            );
          }

          // ── CURRENT SLOT ONLY ──
          const slotSessions = slot
            ? activeSessions.filter(s => {
                const st = s.start_time?.substring(0,5) || '';
                const et = s.end_time?.substring(0,5) || '';
                return st <= nowStr && et > nowStr;
              })
            : [];
          const examRooms = Object.entries(examOccupiedNow);
          const hasAnything = slotSessions.length > 0 || examRooms.length > 0;

          if (!slot) return (
            <div className="empty-state" style={{ padding: '24px 20px' }}>
              <div className="empty-state-icon">⏰</div>
              <p style={{ fontSize: '0.82rem' }}>لا توجد فترة دراسية حالياً</p>
            </div>
          );
          if (!hasAnything) return (
            <div className="empty-state" style={{ padding: '24px 20px' }}>
              <div className="empty-state-icon">✅</div>
              <p style={{ fontSize: '0.82rem' }}>لا توجد محاضرات أو امتحانات في هذه الفترة</p>
            </div>
          );
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {slotSessions.map((s, i) => <SessionRow key={i} s={s} />)}
              {examRooms.map(([room, exam], i) => <ExamRow key={'ex-' + i} room={room} exam={exam} />)}
            </div>
          );
        })()}
      </div>
    </div>
  );
}





function KpiCard({ icon, label, value, subtitle, color, onClick, pulse }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid var(--border)`,
        borderTop: `3px solid ${color}`,
        borderRadius: 'var(--radius)',
        padding: '16px 14px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {pulse && (
        <span style={{
          position: 'absolute', top: 8, left: 8,
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--danger)',
          animation: 'pulse 1.5s infinite',
        }} />
      )}
      <div style={{ fontSize: '1.6rem', marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: color, lineHeight: 1 }}>{value ?? 0}</div>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600, marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>
    </div>
  );
}

function QuickAction({ icon, label, desc, onClick, color, urgent }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        background: urgent ? 'rgba(239,68,68,0.08)' : 'var(--bg-hover)',
        border: `1px solid ${urgent ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = urgent ? 'rgba(239,68,68,0.15)' : 'var(--bg-lighter)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = urgent ? 'rgba(239,68,68,0.08)' : 'var(--bg-hover)'; }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: color + '20',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.1rem', flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{desc}</div>
      </div>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>←</span>
    </div>
  );
}
