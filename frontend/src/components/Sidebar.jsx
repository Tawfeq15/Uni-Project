import React from 'react';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { group: 'الرئيسية', items: [
    { to: '/', icon: '📊', label: 'لوحة التحكم' },
  ]},
  { group: 'البيانات', items: [
    { to: '/uploads',                    icon: '📤', label: 'رفع الملفات' },
    { to: '/exam-imports',               icon: '📥', label: 'استيراد الجداول' },
    { to: '/final-computerized-import',  icon: '🖥️', label: 'الاستيراد المحوسب' },
  ]},
  { group: 'الجدولة', items: [
    { to: '/availability', icon: '🏫', label: 'القاعات المتاحة' },
    { to: '/new-exam',     icon: '➕', label: 'طلب اختبار جديد' },
    { to: '/conflicts',    icon: '⚠️', label: 'التعارضات' },
    { to: '/schedule',     icon: '🗓️', label: 'الجدول النهائي' },
    { to: '/calendar',     icon: '📅', label: 'التقويم الشامل' },
  ]},
];

export default function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">🎓</div>
        <div className="sidebar-logo-text">
          <h2>Exam Scheduler Pro</h2>
          <span>نظام جدولة الاختبارات</span>
        </div>
      </div>

      <div className="sidebar-nav">
        {NAV_ITEMS.map(group => (
          <div key={group.group}>
            <div className="nav-group-label">{group.group}</div>
            {group.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <div style={{ marginBottom: 4, color: 'var(--primary)', fontWeight: 600 }}>● نظام جامعي متكامل</div>
        <div>Exam Scheduler Pro v2.0</div>
      </div>
    </nav>
  );
}
