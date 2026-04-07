import React, { useEffect, useState } from 'react';
import { dashboardAPI } from '../api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';

const FACULTY_COLORS = ['#7c6af3', '#38bdf8', '#22c55e', '#f59e0b', '#ef4444'];

const DAY_AR = {
  sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء', thursday: 'الخميس', friday: 'الجمعة', saturday: 'السبت',
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await dashboardAPI.stats();
      setStats(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <div className="page">
      <div className="spinner"></div>
    </div>
  );

  if (error) return (
    <div className="page">
      <div className="alert alert-danger">❌ {error}</div>
    </div>
  );

  async function handleReset() {
    if (!confirm('⚠️ تحذير: هل أنت متأكد من رغبتك في مسح كافة الملفات والجلسات المرفوعة، والاختبارات، والتعارضات بالكامل؟\n(هذا الإجراء سيخلي النظام من كافة البيانات ليبدأ فصلاً جديداً)')) return;
    try {
      setLoading(true);
      const res = await dashboardAPI.reset();
      if (res.success) {
        alert('تم تفريغ النظام بنجاح للتجهيز لفصل دراسي جديد.');
        load();
      }
    } catch (e) {
      alert('خطأ أثناء المسح: ' + e.message);
      setLoading(false);
    }
  }

  const statCards = [
    { label: 'ملفات مرفوعة', value: stats.uploaded_files, icon: '📤', color: 'primary' },
    { label: 'جلسات محاضرات', value: stats.total_sessions, icon: '📋', color: 'info' },
    { label: 'مختبرات محوسبة', value: stats.total_labs, icon: '💻', color: 'success' },
    { label: 'قاعات أخرى', value: stats.total_rooms, icon: '🏫', color: 'warning' },
    { label: 'طلبات اختبار', value: stats.exam_requests, icon: '📝', color: 'primary' },
    { label: 'اختبارات مجدولة', value: stats.scheduled_exams, icon: '✅', color: 'success' },
    { label: 'غير مجدولة', value: stats.unscheduled_exams, icon: '⏳', color: 'warning' },
    { label: 'تعارضات', value: stats.conflicts, icon: '⚠️', color: 'danger' },
  ];

  const facultyChartData = (stats.by_faculty || []).map(f => ({
    name: f.faculty,
    جلسات: f.sessions,
    مختبرات: f.rooms,
  }));

  const scheduledChartData = (stats.scheduled_by_faculty || []).map(f => ({
    name: f.faculty,
    value: f.exams,
  }));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 لوحة التحكم</h1>
          <p className="page-subtitle">نظرة عامة على بيانات النظام وإحصائياته الحية</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={load}>🔄 تحديث</button>
          <button className="btn btn-danger btn-sm" onClick={handleReset}>🗑️ إفراغ النظام بالكامل</button>
        </div>
      </div>

      <div className="stats-grid">
        {statCards.map(card => (
          <div key={card.label} className={`stat-card ${card.color}`}>
            <div className="stat-icon">{card.icon}</div>
            <div className="stat-value">{card.value ?? 0}</div>
            <div className="stat-label">{card.label}</div>
          </div>
        ))}
      </div>

      {stats.uploaded_files === 0 && (
        <div className="alert alert-info mb-4">
          ℹ️ لم يتم رفع أي ملفات بعد. ابدأ بـ <a href="/uploads" style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>رفع جدول المحاضرات</a> لتفعيل النظام.
        </div>
      )}

      {facultyChartData.length > 0 && (
        <div className="two-col" style={{ marginBottom: 24 }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">📊 الجلسات والمختبرات حسب المبنى</h3>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={facultyChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#8b949e' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8b949e' }} />
                <Tooltip
                  contentStyle={{ background: '#1c2333', border: '1px solid #30363d', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#e6edf3' }}
                />
                <Bar dataKey="جلسات" fill="#7c6af3" radius={[4, 4, 0, 0]} />
                <Bar dataKey="مختبرات" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {scheduledChartData.length > 0 ? (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">🎯 الاختبارات المجدولة حسب الكلية</h3>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={scheduledChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: '#585f6a' }}
                  >
                    {scheduledChartData.map((_, i) => (
                      <Cell key={i} fill={FACULTY_COLORS[i % FACULTY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1c2333', border: '1px solid #30363d', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="card">
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <div className="empty-state-icon">📅</div>
                <h3>لا توجد اختبارات مجدولة</h3>
                <p>أضف اختبارات جديدة من صفحة "طلب اختبار جديد"</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick status checks */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">🚦 حالة النظام</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          <StatusBadge
            label="جداول المحاضرات"
            ok={stats.uploaded_files > 0}
            okText="مرفوعة ✅"
            failText="لم يتم الرفع"
          />
          <StatusBadge
            label="بيانات القاعات"
            ok={stats.total_rooms + stats.total_labs > 0}
            okText={`${stats.total_rooms + stats.total_labs} قاعة`}
            failText="لا توجد قاعات"
          />
          <StatusBadge
            label="التعارضات"
            ok={stats.conflicts === 0}
            okText="لا توجد تعارضات"
            failText={`${stats.conflicts} تعارض`}
            okColor="success"
            failColor="danger"
          />
          <StatusBadge
            label="طلبات الاختبار"
            ok={stats.unscheduled_exams === 0}
            okText="جميعها مجدولة"
            failText={`${stats.unscheduled_exams} غير مجدولة`}
            okColor="success"
            failColor="warning"
          />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ label, ok, okText, failText, okColor = 'success', failColor = 'warning' }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      padding: '12px 14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    }}>
      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{label}</span>
      <span className={`badge badge-${ok ? okColor : failColor}`}>
        {ok ? okText : failText}
      </span>
    </div>
  );
}
