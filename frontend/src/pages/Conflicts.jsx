import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { importConflictsAPI, conflictsAPI } from '../api';
import { useToast } from '../components/Toast';

const DAY_AR = {
  sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء', thursday: 'الخميس', saturday: 'السبت', friday: 'الجمعة',
};

const CONFLICT_TYPE_LABEL = {
  room_conflict:              '🏢 تعارض قاعتين',
  lecturer_conflict:          '👨‍🏫 تعارض محاضر',
  lecture_overlap:            '📚 تعارض مع محاضرة',
  uncertain_day_conflict:     '❔ يوم غير محدد',
  own_course_lecture_warning: '⚠️ نفس المادة (تحقق)',
  capacity_issue:             '📊 سعة غير كافية',
  unscheduled:                '🕐 غير مجدول',
  parse_error:                '⚙️ خطأ في التحليل',
};

const CONFLICT_SEVERITY_COLOR = {
  error:   { bg: 'rgba(239,68,68,0.08)',   border: 'var(--danger)',  badge: 'badge-danger' },
  warning: { bg: 'rgba(245,158,11,0.07)', border: 'var(--warning)', badge: 'badge-warning' },
};

export default function Conflicts() {
  // ── Import-level conflicts (exam_conflict_groups) ──
  const [conflictGroups, setConflictGroups] = useState([]);
  const [importLoading, setImportLoading]   = useState(true);
  const [actionLoading, setActionLoading]   = useState(false);

  // ── System-level conflicts (conflicts table) ──
  const [sysConflicts, setSysConflicts]     = useState([]);
  const [sysSummary, setSysSummary]         = useState(null);
  const [sysLoading, setSysLoading]         = useState(true);
  const [rebuildLoading, setRebuildLoading] = useState(false);
  const [rebuildResult, setRebuildResult]   = useState(null);
  const [expandedId, setExpandedId]         = useState(null);
  const [activeTab, setActiveTab]           = useState('system'); // 'system' | 'import'
  const toast = useToast();

  const openGroups = conflictGroups.filter(g => g.status === 'open');
  const sysErrors   = sysConflicts.filter(c => c.severity === 'error').length;
  const sysWarnings = sysConflicts.filter(c => c.severity === 'warning').length;

  const loadImport = useCallback(async () => {
    setImportLoading(true);
    try {
      const data = await importConflictsAPI.getGroups();
      setConflictGroups(data.groups || []);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setImportLoading(false);
    }
  }, []);

  const loadSystem = useCallback(async () => {
    setSysLoading(true);
    try {
      const data = await conflictsAPI.list();
      setSysConflicts(data.conflicts || []);
      setSysSummary(data.summary || null);
    } catch (e) {
      toast('فشل تحميل تعارضات النظام: ' + e.message, 'error');
    } finally {
      setSysLoading(false);
    }
  }, []);

  useEffect(() => { loadImport(); loadSystem(); }, [loadImport, loadSystem]);
  
  // Smart Tab Selection: Switch to tab with conflicts if current is empty
  useEffect(() => {
    if (!sysLoading && !importLoading) {
      if (activeTab === 'system' && (sysErrors + sysWarnings) === 0 && openGroups.length > 0) {
        setActiveTab('import');
      } else if (activeTab === 'import' && openGroups.length === 0 && (sysErrors + sysWarnings) > 0) {
        setActiveTab('system');
      }
    }
  }, [sysLoading, importLoading, sysErrors, sysWarnings, openGroups.length, activeTab]);

  async function handleResolve(groupId, itemId, decision, payloadData = null) {
    if (decision === 'ignore' && !confirm('هل أنت متأكد من تجاهل هذا التعارض؟')) return;
    if (decision === 'accept_overlap' && !confirm('هل أنت متأكد من فرض الجدولة رغم التعارض؟')) return;
    setActionLoading(true);
    try {
      let res;
      if (decision === 'ignore')                                        res = await importConflictsAPI.rejectItem(groupId, itemId);
      else if (decision === 'accept_overlap' || decision === 'replace_existing') res = await importConflictsAPI.approveItem(groupId, itemId);
      else if (decision === 'modify_rooms')                             res = await importConflictsAPI.rescheduleItem(groupId, itemId, payloadData);
      toast(res?.message || 'تمت معالجة التعارض', 'success');
      loadImport();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRebuild() {
    if (!confirm('سيتم إعادة فحص جميع تعارضات النظام. هل تريد المتابعة؟')) return;
    setRebuildLoading(true);
    setRebuildResult(null);
    try {
      const res = await conflictsAPI.rebuild();
      setRebuildResult(res);
      toast(`تمت إعادة الفحص — ${res.conflicts_count} تعارض | تم إزالة ${res.false_conflicts_removed} تعارض خاطئ`, 'success');
      loadSystem();
    } catch (e) {
      toast('فشلت إعادة الفحص: ' + e.message, 'error');
    } finally {
      setRebuildLoading(false);
    }
  }

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">⚠️ التعارضات والمشاكل</h1>
          <p className="page-subtitle">مراجعة ومعالجة تعارضات القاعات والمحاضرات والجدولة</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { loadImport(); loadSystem(); }} disabled={importLoading || sysLoading}>
            🔄 تحديث
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className={`stat-card ${sysErrors > 0 ? 'danger' : 'success'}`}>
          <div className="stat-label">تعارضات حقيقية (نظام)</div>
          <div className="stat-value">{sysErrors}</div>
          <div className="stat-subtitle">قاعات ومحاضرون</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-label">تحذيرات النظام</div>
          <div className="stat-value">{sysWarnings}</div>
          <div className="stat-subtitle">تعارضات محتملة</div>
        </div>
        <div className={`stat-card ${openGroups.length > 0 ? 'danger' : 'success'}`}>
          <div className="stat-label">تعارضات الاستيراد</div>
          <div className="stat-value">{openGroups.length}</div>
          <div className="stat-subtitle">تنتظر معالجة</div>
        </div>
        <div className="stat-card primary">
          <div className="stat-label">إجمالي التعارضات</div>
          <div className="stat-value">{sysErrors + openGroups.length}</div>
          <div className="stat-subtitle">يتطلب مراجعة</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
        {[
          { key: 'system', label: `🔍 تعارضات النظام (${sysErrors + sysWarnings})` },
          { key: 'import', label: `📥 تعارضات الاستيراد (${openGroups.length})` },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer',
            fontWeight: activeTab === tab.key ? 700 : 400,
            color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
            fontSize: '0.9rem', marginBottom: -2,
          }}>{tab.label}</button>
        ))}
      </div>

      {/* ── SYSTEM CONFLICTS TAB ── */}
      {activeTab === 'system' && (
        <div>
          {/* Rebuild Banner */}
          <div className="card" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>🔄 إعادة فحص التعارضات</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  يقوم النظام بمقارنة الامتحانات المجدولة مع جدول المحاضرات بشكل دقيق — مع مراعاة اليوم والتاريخ والوقت والقاعة.
                  يتم تجاهل التعارضات الوهمية (محاضرات في أيام مختلفة عن يوم الامتحان).
                </div>
                {rebuildResult && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span className="badge badge-primary">{rebuildResult.conflicts_count} تعارض جديد</span>
                    <span className="badge badge-success">تم إزالة {rebuildResult.false_conflicts_removed} تعارض خاطئ</span>
                  </div>
                )}
              </div>
              <button
                className="btn btn-primary"
                onClick={handleRebuild}
                disabled={rebuildLoading}
                style={{ minWidth: 160, whiteSpace: 'nowrap' }}
              >
                {rebuildLoading ? (
                  <><span className="spinner spinner-sm" style={{ display: 'inline-block', width: 14, height: 14, marginLeft: 8 }} />جاري الفحص...</>
                ) : '🔍 إعادة فحص التعارضات'}
              </button>
            </div>
          </div>

          {/* System conflicts list */}
          {sysLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>
          ) : sysConflicts.length === 0 ? (
            <div className="empty-state card">
              <div className="empty-state-icon">🎉</div>
              <h3>لا توجد تعارضات في النظام!</h3>
              <p>جميع الامتحانات المجدولة لا تتعارض مع المحاضرات أو القاعات.</p>
              <button className="btn btn-secondary" onClick={handleRebuild} disabled={rebuildLoading}>
                🔍 فحص الآن
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Group by type */}
              {Object.entries(
                sysConflicts.reduce((acc, c) => {
                  const t = c.conflict_type;
                  if (!acc[t]) acc[t] = [];
                  acc[t].push(c);
                  return acc;
                }, {})
              ).map(([type, items]) => (
                <div key={type}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6, paddingRight: 4 }}>
                    {CONFLICT_TYPE_LABEL[type] || type} <span className="badge badge-gray" style={{ fontSize: '0.72rem' }}>{items.length}</span>
                  </div>
                  {items.map(c => (
                    <SystemConflictCard
                      key={c.id}
                      conflict={c}
                      expanded={expandedId === c.id}
                      onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── IMPORT CONFLICTS TAB ── */}
      {activeTab === 'import' && (
        <div>
          {importLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>
          ) : openGroups.length === 0 ? (
            <div className="empty-state card">
              <div className="empty-state-icon">🎉</div>
              <h3>لا توجد تعارضات استيراد!</h3>
              <p>جميع بيانات الجدول سليمة ولا تتطلب أي تدخل.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {openGroups.map(group => (
                <ConflictCard key={group.id} group={group} onResolve={handleResolve} actionLoading={actionLoading} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── System conflict card ────────────────────────────────────────────────────

function SystemConflictCard({ conflict, expanded, onToggle }) {
  const colors = CONFLICT_SEVERITY_COLOR[conflict.severity] || CONFLICT_SEVERITY_COLOR.warning;
  const details = conflict.details || null;

  return (
    <div style={{
      background: colors.bg, border: `1px solid ${colors.border}`,
      borderRadius: 10, marginBottom: 8, overflow: 'hidden',
    }}>
      {/* Header row */}
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', cursor: 'pointer' }}
        onClick={onToggle}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1 }}>
          <span className={`badge ${colors.badge}`} style={{ flexShrink: 0 }}>
            {conflict.severity === 'error' ? 'تعارض' : 'تنبيه'}
          </span>
          <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{conflict.message}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {conflict.room && <span className="badge badge-gray" style={{ fontSize: '0.75rem' }}>{conflict.room}</span>}
          {conflict.day && <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>{DAY_AR[conflict.day] || conflict.day}</span>}
          {conflict.exam_date && <span dir="ltr" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{conflict.exam_date}</span>}
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${colors.border}` }}>
          <div style={{ paddingTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {/* Time */}
            {conflict.start_time && (
              <div style={detailBox}>
                <div style={detailLabel}>⏰ وقت الامتحان</div>
                <div style={detailVal} dir="ltr">{conflict.start_time?.substring(0,5)} — {conflict.end_time?.substring(0,5)}</div>
              </div>
            )}
            {/* Exam date & day */}
            {conflict.exam_date && (
              <div style={detailBox}>
                <div style={detailLabel}>📅 تاريخ الامتحان</div>
                <div style={detailVal}>{conflict.exam_date} ({DAY_AR[conflict.day] || conflict.day})</div>
              </div>
            )}
            {/* Room */}
            {conflict.room && (
              <div style={detailBox}>
                <div style={detailLabel}>🏢 القاعة</div>
                <div style={detailVal}>{conflict.room}</div>
              </div>
            )}
            {/* Lecturer */}
            {conflict.lecturer && (
              <div style={detailBox}>
                <div style={detailLabel}>👨‍🏫 المحاضر</div>
                <div style={detailVal}>{conflict.lecturer}</div>
              </div>
            )}

            {/* Details from JSON */}
            {details && (
              <>
                {details.session_days?.length > 0 && (
                  <div style={detailBox}>
                    <div style={detailLabel}>📆 أيام المحاضرة</div>
                    <div style={detailVal}>{details.session_days.map(d => DAY_AR[d] || d).join(' | ')}</div>
                  </div>
                )}
                {details.session_course && (
                  <div style={detailBox}>
                    <div style={detailLabel}>📚 مادة المحاضرة</div>
                    <div style={detailVal}>{details.session_course}</div>
                  </div>
                )}
                {details.session_time && (
                  <div style={detailBox}>
                    <div style={detailLabel}>⏱ وقت المحاضرة</div>
                    <div style={detailVal} dir="ltr">{details.session_time}</div>
                  </div>
                )}
                {details.exam_day && (
                  <div style={detailBox}>
                    <div style={detailLabel}>✅ يوم الامتحان المحسوب</div>
                    <div style={detailVal}>{DAY_AR[details.exam_day] || details.exam_day}</div>
                  </div>
                )}
                {details.day_match !== undefined && (
                  <div style={detailBox}>
                    <div style={detailLabel}>🔍 تطابق الأيام</div>
                    <div style={{ ...detailVal, color: details.day_match ? 'var(--danger)' : 'var(--success)' }}>
                      {details.day_match ? '✓ نعم — نفس اليوم' : '✗ لا — أيام مختلفة'}
                    </div>
                  </div>
                )}
                {details.time_overlap !== undefined && (
                  <div style={detailBox}>
                    <div style={detailLabel}>🔍 تداخل الوقت</div>
                    <div style={{ ...detailVal, color: details.time_overlap ? 'var(--danger)' : 'var(--success)' }}>
                      {details.time_overlap ? '✓ نعم — متداخلان' : '✗ لا — غير متداخلين'}
                    </div>
                  </div>
                )}
                {details.own_course !== undefined && (
                  <div style={detailBox}>
                    <div style={detailLabel}>📋 نفس المادة</div>
                    <div style={detailVal}>{details.own_course ? 'نعم (استثناء نفس المادة)' : 'لا (مادة مختلفة)'}</div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Reason explanation */}
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(0,0,0,0.15)', borderRadius: 6, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {conflict.conflict_type === 'lecture_overlap' && '🔴 تعارض حقيقي: الامتحان يقع في نفس يوم المحاضرة ونفس وقتها في نفس القاعة.'}
            {conflict.conflict_type === 'uncertain_day_conflict' && '⚠️ لم يتمكن النظام من تحديد يوم المحاضرة بدقة. يرجى المراجعة اليدوية.'}
            {conflict.conflict_type === 'own_course_lecture_warning' && '💡 المحاضرة تبدو لنفس المادة — قد تكون في نفس الشعبة، تحقق قبل الاعتماد.'}
            {conflict.conflict_type === 'room_conflict' && '🔴 تعارض في القاعة: اثنتان من الامتحانات تستخدمان نفس القاعة في نفس الوقت.'}
            {conflict.conflict_type === 'lecturer_conflict' && '🔴 تعارض في جدول المحاضر: مدرس لديه امتحانين في نفس الوقت.'}
            {conflict.conflict_type === 'capacity_issue' && '📊 سعة القاعات المحجوزة أقل من عدد الطلاب المسجلين.'}
          </div>
        </div>
      )}
    </div>
  );
}

const detailBox = { background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.07)' };
const detailLabel = { fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 3, fontWeight: 600 };
const detailVal   = { fontSize: '0.85rem', fontWeight: 500 };

// ── Import conflict card (unchanged logic) ─────────────────────────────────

function ConflictCard({ group, onResolve, actionLoading }) {
  const navigate = useNavigate();
  const [modifying, setModifying] = useState(false);
  const [overrideRooms, setOverrideRooms] = useState('');
  const item = group.items?.[0];

  return (
    <div className="card" style={{ background: 'rgba(239,68,68,0.05)', borderLeft: '4px solid var(--danger)', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 }}>
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
            <span className="badge badge-danger">تعارض استيراد</span>
            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{group.title}</h3>
          </div>
          <p style={{ color: 'var(--danger)', margin: 0, fontWeight: 500, fontSize: '0.88rem', lineHeight: '1.6' }}>
            {group.description.split(' | ').map((msg, i) => (
              <span key={i} style={{ display: 'block' }}>• {msg}</span>
            ))}
          </p>
        </div>
      </div>

      {item && (
        <div style={{ background: 'rgba(255,255,255,0.03)', padding: 15, borderRadius: 8, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 15 }}>
            <div><strong style={{ color: 'var(--text-secondary)' }}>المادة:</strong> {item.course_code} - {item.course_name}</div>
            <div dir="ltr"><strong style={{ color: 'var(--text-secondary)' }}>التاريخ:</strong> {item.exam_date} | {item.start_time?.substring(0, 5)} - {item.end_time?.substring(0, 5)}</div>
            <div><strong style={{ color: 'var(--text-secondary)' }}>المحاضر:</strong> {item.instructor_name || '-'}</div>
            <div><strong style={{ color: 'var(--text-secondary)' }}>القاعات:</strong> {(JSON.parse(item.room_names || '[]')).join('-')}</div>
          </div>
        </div>
      )}

      {modifying ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.05)', padding: 15, borderRadius: 8 }}>
          <input
            type="text" className="form-control"
            placeholder="القاعات الجديدة مفصولة بـ (-) مثل: 2101-2102"
            value={overrideRooms} onChange={e => setOverrideRooms(e.target.value)}
            dir="ltr" style={{ width: '300px' }}
          />
          <button className="btn btn-primary" disabled={actionLoading || !overrideRooms.trim() || !item}
            onClick={() => item && onResolve(group.id, item.id, 'modify_rooms', {
              rooms: overrideRooms.split('-').map(r => r.trim()).filter(Boolean),
              exam_date: item.exam_date, start_time: item.start_time, end_time: item.end_time, notes: 'تعديل القاعات',
            })}>حفظ القاعات</button>
          <button className="btn btn-secondary" onClick={() => setModifying(false)}>إلغاء</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10 }}>
          {group.conflict_type === 'duplicate_course_exam' ? (
            <button className="btn btn-warning" disabled={actionLoading || !item} onClick={() => item && onResolve(group.id, item.id, 'replace_existing')}>
              🔄 استبدال الاختبار القديم
            </button>
          ) : (
            <button className="btn btn-danger" disabled={actionLoading || !item} onClick={() => item && onResolve(group.id, item.id, 'accept_overlap')}>
              ⚠️ فرض الجدولة
            </button>
          )}
          {(group.conflict_type === 'system_conflict' || group.conflict_type === 'internal_file_conflict') && (
            <button className="btn btn-primary" onClick={() => navigate('/new-exam', { state: { editExam: item } })}>
              ✏️ تعديل الطلب
            </button>
          )}
          <button className="btn btn-secondary" disabled={actionLoading || !item} onClick={() => item && onResolve(group.id, item.id, 'ignore')}>
            ❌ إلغاء الطلب
          </button>
        </div>
      )}
    </div>
  );
}
