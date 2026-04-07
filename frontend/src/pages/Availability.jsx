import React, { useState, useEffect } from 'react';
import { availabilityAPI } from '../api';
import { useToast } from '../components/Toast';

const DAY_AR = {
  sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء', thursday: 'الخميس', friday: 'الجمعة', saturday: 'السبت',
};

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];

const FACULTY_OPTIONS = [
  { value: '', label: 'الكل (IT + المكتبة)' },
  { value: 'it', label: 'مبنى IT' },
  { value: 'library', label: 'مبنى المكتبة' },
];

const LAB_INFO = {
  '2101': { capacity: 26, building: 'المكتبة', floor: '1' },
  '2102': { capacity: 26, building: 'المكتبة', floor: '1' },
  '2103': { capacity: 26, building: 'المكتبة', floor: '1' },
  '2104': { capacity: 26, building: 'المكتبة', floor: '1' },
  '2105': { capacity: 26, building: 'المكتبة', floor: '1' },
  '2106': { capacity: 26, building: 'المكتبة', floor: '1' },
  '2107': { capacity: 35, building: 'المكتبة', floor: '1' },
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

// Time bar: 8:00 to 16:00
function TimeBar({ occupied, free }) {
  const START = 8 * 60;
  const END = 16 * 60;
  const SPAN = END - START;
  const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16];

  function pct(minutes) {
    return Math.max(0, Math.min(100, ((minutes - START) / SPAN) * 100));
  }

  function toMin(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  return (
    <div style={{ position: 'relative', marginBottom: 4 }}>
      {/* Hour marks */}
      <div style={{ position: 'relative', height: 6, marginBottom: 2 }}>
        {HOURS.map(h => (
          <div key={h} style={{
            position: 'absolute',
            right: `${pct(h * 60)}%`,
            top: 0, bottom: 0,
            width: 1,
            background: 'var(--border)',
          }} />
        ))}
      </div>
      <div style={{ position: 'relative', height: 18, background: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden' }}>
        {/* Free slots (green) */}
        {free.map((f, i) => {
          const s = toMin(f.start), e = toMin(f.end);
          return (
            <div key={i} style={{
              position: 'absolute',
              right: `${pct(s)}%`,
              width: `${pct(e) - pct(s)}%`,
              top: 0, bottom: 0,
              background: 'var(--success)',
              opacity: 0.7,
            }} title={`متاح: ${f.start} – ${f.end}`} />
          );
        })}
        {/* Occupied (red) */}
        {occupied.map((o, i) => {
          const s = toMin(o.start), e = toMin(o.end);
          return (
            <div key={i} style={{
              position: 'absolute',
              right: `${pct(s)}%`,
              width: `${pct(e) - pct(s)}%`,
              top: 0, bottom: 0,
              background: 'var(--danger)',
              opacity: 0.7,
            }} title={`محاضرة: ${o.start} – ${o.end}`} />
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>
        {HOURS.map(h => <span key={h}>{h}:00</span>)}
      </div>
    </div>
  );
}

export default function Availability() {
  const [slots, setSlots] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [roomDetails, setRoomDetails] = useState({});
  const [filters, setFilters] = useState({ faculty: '', day: '', duration: '', studentCount: '' });
  const toast = useToast();

  useEffect(() => { load(); }, [filters]);
  useEffect(() => {
    availabilityAPI.summary().then(setSummary).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      const params = { roomType: 'lab' }; // always show labs only
      if (filters.faculty) params.faculty = filters.faculty;
      if (filters.day) params.day = filters.day;
      if (filters.duration) params.duration = filters.duration;
      if (filters.studentCount) params.studentCount = filters.studentCount;

      const [slotsData, roomsData] = await Promise.all([
        availabilityAPI.freeSlots(params),
        availabilityAPI.rooms(filters.faculty || null),
      ]);
      setSlots(slotsData.slots || []);
      setRooms(roomsData.rooms || []);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadRoomDay(room, day) {
    const key = `${room}___${day}`;
    if (roomDetails[key]) return;
    try {
      const data = await availabilityAPI.roomDay(room, day);
      setRoomDetails(prev => ({ ...prev, [key]: data }));
    } catch {}
  }

  function setFilter(key, val) {
    setFilters(prev => ({ ...prev, [key]: val }));
  }

  // Group free slots by room
  const slotsByRoom = {};
  for (const slot of slots) {
    const key = slot.room;
    if (!slotsByRoom[key]) slotsByRoom[key] = { room: slot.room, faculty: slot.faculty, capacity: slot.capacity, days: {} };
    if (!slotsByRoom[key].days[slot.day]) slotsByRoom[key].days[slot.day] = [];
    slotsByRoom[key].days[slot.day].push(slot);
  }

  // All known labs: merge rooms from DB with slot data
  const allRooms = [...new Set([...rooms.map(r => r.room_name), ...Object.keys(slotsByRoom)])].sort();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🔬 المختبرات المتاحة</h1>
          <p className="page-subtitle">عرض الأوقات الحرة والمشغولة لكل مختبر (8:00 – 16:00)</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}>🔄 تحديث</button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="stats-grid" style={{ marginBottom: 20, gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { label: 'مختبرات IT', value: rooms.filter(r => r.faculty === 'it').length, icon: '💻', color: 'info' },
            { label: 'مختبرات المكتبة', value: rooms.filter(r => r.faculty === 'library').length, icon: '📚', color: 'primary' },
            { label: 'إجمالي المختبرات', value: rooms.length, icon: '🔬', color: 'warning' },
            { label: 'مختبرات متاحة اليوم', value: summary.free_labs ?? 0, icon: '✅', color: 'success' },
          ].map(c => (
            <div key={c.label} className={`stat-card ${c.color}`}>
              <div className="stat-icon" style={{ fontSize: '1.4rem', marginBottom: 8 }}>{c.icon}</div>
              <div className="stat-value" style={{ fontSize: '1.5rem' }}>{c.value ?? 0}</div>
              <div className="stat-label">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="filter-bar">
        <div className="form-group">
          <label className="form-label">المبنى</label>
          <select className="form-control" value={filters.faculty} onChange={e => setFilter('faculty', e.target.value)}>
            {FACULTY_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">اليوم</label>
          <select className="form-control" value={filters.day} onChange={e => setFilter('day', e.target.value)}>
            <option value="">جميع الأيام</option>
            {DAYS.map(d => <option key={d} value={d}>{DAY_AR[d]}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">مدة الاختبار (دقيقة)</label>
          <select className="form-control" value={filters.duration} onChange={e => setFilter('duration', e.target.value)}>
            <option value="">أي مدة</option>
            <option value="60">60 دقيقة</option>
            <option value="90">90 دقيقة</option>
            <option value="120">120 دقيقة</option>
            <option value="150">150 دقيقة</option>
            <option value="180">180 دقيقة</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">الحد الأدنى لعدد الطلاب</label>
          <input
            type="number"
            className="form-control"
            placeholder="مثال: 20"
            value={filters.studentCount}
            onChange={e => setFilter('studentCount', e.target.value)}
          />
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setFilters({ faculty: '', day: '', duration: '', studentCount: '' })}>
          ✕ مسح
        </button>
      </div>

      {/* Legend */}
      <div className="alert alert-info mb-3" style={{ fontSize: '0.82rem' }}>
        🕐 <strong>الأوقات محسوبة:</strong> من 8:00 صباحاً إلى 4:00 مساءً. &nbsp;
        <span style={{ color: 'var(--danger)', fontWeight: 700 }}>■</span> مشغول &nbsp;|&nbsp;
        <span style={{ color: 'var(--success)', fontWeight: 700 }}>■</span> متاح فارغ
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner"></div></div>
      ) : allRooms.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔬</div>
          <h3>لا توجد بيانات مختبرات</h3>
          <p>ارفع جدول محاضرات أولاً حتى يتمكن النظام من حساب الأوقات المتاحة.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {allRooms.map(roomName => {
            const dbRoom = rooms.find(r => r.room_name === roomName);
            const slotData = slotsByRoom[roomName];
            const info = LAB_INFO[roomName] || {};
            const capacity = dbRoom?.capacity || info.capacity || slotData?.capacity || 0;
            const faculty = dbRoom?.faculty || slotData?.faculty || '';
            const hasSlots = slotData && Object.keys(slotData.days).length > 0;

            return (
              <LabCard
                key={roomName}
                roomName={roomName}
                capacity={capacity}
                faculty={faculty}
                info={info}
                slotData={slotData}
                hasSlots={hasSlots}
                loadRoomDay={loadRoomDay}
                roomDetails={roomDetails}
                filterDay={filters.day}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function LabCard({ roomName, capacity, faculty, info, slotData, hasSlots, loadRoomDay, roomDetails, filterDay }) {
  const [expanded, setExpanded] = useState(false);

  const DAYS_CONSTANT = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];

  function toggle() {
    setExpanded(e => !e);
    if (!expanded) {
      DAYS_CONSTANT.forEach(day => loadRoomDay(roomName, day));
    }
  }

  const daysWithFreeSlots = slotData ? Object.keys(slotData.days) : [];
  const totalFreeSlots = slotData ? Object.values(slotData.days).flat().length : 0;
  const displayDays = filterDay ? DAYS_CONSTANT.filter(d => d === filterDay) : DAYS_CONSTANT;

  const buildingColor = faculty === 'it' ? 'var(--info)' : 'var(--primary)';
  const buildingLabel = info.building || faculty;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 20px', cursor: 'pointer',
          background: expanded ? 'var(--bg-hover)' : 'transparent',
          transition: 'background 0.2s',
        }}
        onClick={toggle}
      >
        {/* Lab icon & info */}
        <div style={{
          width: 42, height: 42, borderRadius: 10,
          background: buildingColor + '20',
          border: `1px solid ${buildingColor}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.3rem', flexShrink: 0,
        }}>
          🖥️
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>{roomName}</div>
          <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', display: 'flex', gap: 8, marginTop: 2 }}>
            {buildingLabel && <span style={{ color: buildingColor }}>📍 {buildingLabel}</span>}
            {info.floor && <span>الطابق {info.floor}</span>}
            <span>•</span>
            <span>سعة <strong style={{ color: 'var(--text-primary)' }}>{capacity}</strong> طالب</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {hasSlots ? (
            <span className="badge badge-success">✅ {totalFreeSlots} فترة حرة</span>
          ) : (
            <span className="badge badge-gray">مشغول / لا بيانات</span>
          )}
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px' }}>
          {/* Capacity visual */}
          <div style={{
            marginBottom: 14, padding: '10px 14px',
            background: 'var(--bg-secondary)',
            borderRadius: 8,
            display: 'flex', gap: 20, alignItems: 'center',
            fontSize: '0.82rem',
          }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>السعة الكلية</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent)' }}>{capacity} طالب</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>المبنى</div>
              <div style={{ fontWeight: 600, color: buildingColor }}>{buildingLabel}</div>
            </div>
            {info.floor && (
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>الطابق</div>
                <div style={{ fontWeight: 600 }}>{info.floor}</div>
              </div>
            )}
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>النوع</div>
              <div style={{ fontWeight: 600 }}>🔬 مختبر محوسب</div>
            </div>
          </div>

          {false ? null : (
            displayDays.map(day => {
              const key = `${roomName}___${day}`;
              const details = roomDetails[key];
              const daySlots = slotData?.days[day] || [];
              return (
                <div key={day} style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 8, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    📅 {DAY_AR[day] || day}
                    {daySlots.length > 0 ? (
                      <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>{daySlots.length} فترة حرة</span>
                    ) : (
                      <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>0 فترة حرة (مشغول بالكامل)</span>
                    )}
                  </div>

                  {/* Timeline */}
                  {details ? (
                    details.free.length > 0 ? (
                      <TimeBar occupied={details.occupied} free={details.free} />
                    ) : (
                      <div style={{ height: 24, background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', fontSize: '0.8rem', fontWeight: 600 }}>
                        ❌ مشغول بالكامل (لا توجد فترات حرة تتسع لامتحان)
                      </div>
                    )
                  ) : (
                    <div style={{ height: 24, background: 'var(--bg-hover)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="spinner spinner-sm"></span>
                    </div>
                  )}

                  {/* Free slots chips */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {daySlots.map((slot, i) => (
                      <div key={i} style={{
                        background: 'var(--success-bg)',
                        border: '1px solid rgba(34,197,94,0.25)',
                        borderRadius: 6,
                        padding: '4px 12px',
                        fontSize: '0.78rem',
                        color: 'var(--success)',
                        fontWeight: 600,
                      }}>
                        🕐 {slot.available_from} – {slot.available_to}
                        <span style={{ opacity: 0.7, marginRight: 4 }}>({slot.duration_minutes}د)</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
