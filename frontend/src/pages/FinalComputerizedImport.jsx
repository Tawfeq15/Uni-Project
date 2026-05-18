import React, { useState, useRef, useCallback } from 'react';
import { finalComputerizedImportsAPI } from '../api';
import { useToast } from '../components/Toast';

const STATUS_BADGE = {
  assigned:     { cls: 'badge-success', label: 'تم التوزيع' },
  needs_review: { cls: 'badge-warning', label: 'يحتاج مراجعة' },
  conflict:     { cls: 'badge-danger',  label: 'تعارض' },
  invalid:      { cls: 'badge-danger',  label: 'بيانات ناقصة' },
  valid:        { cls: 'badge-info',    label: 'صالح' },
  imported:     { cls: 'badge-primary', label: 'مستورد' },
  pending:      { cls: 'badge-gray',    label: 'معلق' },
};

const PRIORITY_BADGE = {
  library: { cls: 'badge-success', label: 'مكتبة' },
  it:      { cls: 'badge-info',    label: 'IT' },
  other:   { cls: 'badge-gray',    label: 'كليات أخرى' },
};

export default function FinalComputerizedImport() {
  const { addToast } = useToast();
  const fileRef = useRef();

  // Form
  const [form, setForm]   = useState({
    academic_year: '2025-2026',
    semester: '2',
    exam_period: 'final',
    faculty: '',
  });
  const [file, setFile]   = useState(null);

  // State
  const [importId,  setImportId]  = useState(null);
  const [rows,      setRows]      = useState([]);
  const [summary,   setSummary]   = useState(null);
  const [loading,   setLoading]   = useState('');
  const [dragOver,  setDragOver]  = useState(false);

  // Helpers
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const calcSummary = (rowList) => {
    const total     = rowList.length;
    const students  = rowList.reduce((s, r) => s + (r.student_count || 0), 0);
    const assigned  = rowList.filter(r => r.status === 'assigned' || r.status === 'imported').length;
    const review    = rowList.filter(r => r.status === 'needs_review').length;
    const conflicts = rowList.filter(r => r.status === 'conflict').length;
    const capIssue  = rowList.filter(r => {
      const w = typeof r.warnings === 'string' ? JSON.parse(r.warnings || '[]') : (r.warnings || []);
      return w.some(x => x && x.includes('غير كافية'));
    }).length;
    setSummary({ total, students, assigned, review, conflicts, capIssue });
  };

  const loadRows = async (id) => {
    const res = await finalComputerizedImportsAPI.rows(id);
    if (res.success) {
      const list = res.data || [];
      setRows(list);
      calcSummary(list);
    }
  };

  // ── STEP 1: Preview ──────────────────────────────────────────────────────
  const handlePreview = async () => {
    if (!file) { addToast('اختر ملف Excel أولاً', 'warning'); return; }

    setLoading('preview');
    const fd = new FormData();
    fd.append('file', file);
    Object.entries(form).forEach(([k, v]) => v && fd.append(k, v));

    const res = await finalComputerizedImportsAPI.preview(fd);
    setLoading('');

    if (res.success) {
      setImportId(res.import_id);
      await loadRows(res.import_id);
      addToast(`تم قراءة ${res.total_rows} سطر بنجاح`, 'success');
    } else {
      addToast(res.message || 'فشل في قراءة الملف', 'error');
    }
  };

  // ── STEP 2: Assign Labs ──────────────────────────────────────────────────
  const handleAssign = async () => {
    if (!importId) { addToast('قم بقراءة الملف أولاً', 'warning'); return; }
    setLoading('assign');
    const res = await finalComputerizedImportsAPI.assignLabs(importId);
    setLoading('');

    if (res.success) {
      await loadRows(importId);
      addToast(`تم توزيع المختبرات: ${res.assigned} ✓  يحتاج مراجعة: ${res.needs_review}`, 'success');
    } else {
      addToast(res.message || 'فشل في التوزيع', 'error');
    }
  };

  // ── STEP 3: Confirm ──────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!importId) { addToast('قم بالتوزيع أولاً', 'warning'); return; }
    if (!window.confirm('هل تريد تأكيد واعتماد الجدول؟ سيتم حفظ الامتحانات في النظام.')) return;

    setLoading('confirm');
    const res = await finalComputerizedImportsAPI.confirm(importId);
    setLoading('');

    if (res.success) {
      await loadRows(importId);
      addToast(`تم اعتماد ${res.imported} امتحان بنجاح`, 'success');
    } else {
      addToast(res.message || 'فشل في الاعتماد', 'error');
    }
  };

  // ── STEP 4: Export ───────────────────────────────────────────────────────
  const handleExport = () => {
    if (!importId) { addToast('قم بالتوزيع أولاً', 'warning'); return; }
    finalComputerizedImportsAPI.exportExcel(importId);
  };

  // ── Drag & Drop ──────────────────────────────────────────────────────────
  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="page" style={{ animation: 'fadeInUp .4s ease-out' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">🖥️ استيراد الامتحانات النهائية المحوسبة</h1>
          <p className="page-subtitle">
            رفع جدول الامتحانات النهائية وتوزيع المختبرات تلقائيًا حسب الأولوية والسعة
          </p>
        </div>
      </div>

      {/* Upload Card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">📂 إعدادات الاستيراد</span>
          <span className="badge badge-info">استيراد مستقل</span>
        </div>

        <div className="form-row" style={{ marginBottom: 20 }}>
          <div className="form-group">
            <label className="form-label">العام الأكاديمي</label>
            <input className="form-control" value={form.academic_year}
              onChange={e => setField('academic_year', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">الفصل الدراسي</label>
            <select className="form-control" value={form.semester}
              onChange={e => setField('semester', e.target.value)}>
              <option value="1">الأول</option>
              <option value="2">الثاني</option>
              <option value="summer">الصيفي</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">فترة الامتحان</label>
            <select className="form-control" value={form.exam_period}
              onChange={e => setField('exam_period', e.target.value)}>
              <option value="final">نهائي</option>
              <option value="midterm">نصف الفصل</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">الكلية (اختياري)</label>
            <input className="form-control" value={form.faculty} placeholder="جميع الكليات"
              onChange={e => setField('faculty', e.target.value)} />
          </div>
        </div>

        {/* File Drop Zone */}
        <div
          className={`upload-zone${dragOver ? ' dragging' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{ marginBottom: 20, cursor: 'pointer' }}
        >
          <div className="upload-zone-icon">📊</div>
          <div className="upload-zone-text">
            {file ? `✅ ${file.name}` : 'اسحب ملف Excel هنا أو اضغط للاختيار'}
          </div>
          <div className="upload-zone-hint">xlsx · xls — يجب أن يحتوي على ورقة FINAL أو الأولى</div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={e => setFile(e.target.files[0])} />
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handlePreview} disabled={!!loading}>
            {loading === 'preview' ? <span className="spinner-sm" /> : '🔍'}
            قراءة ومعاينة الملف
          </button>
          <button className="btn btn-secondary" onClick={handleAssign}
            disabled={!!loading || !importId}>
            {loading === 'assign' ? <span className="spinner-sm" /> : '🤖'}
            توزيع المختبرات تلقائيًا
          </button>
          <button className="btn btn-success" onClick={handleConfirm}
            disabled={!!loading || !importId}>
            {loading === 'confirm' ? <span className="spinner-sm" /> : '✅'}
            تأكيد واعتماد الجدول
          </button>
          <button className="btn btn-secondary" onClick={handleExport}
            disabled={!importId} style={{ marginRight: 'auto' }}>
            📥 تصدير Excel بعد التوزيع
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card primary">
            <div className="stat-icon">📋</div>
            <div className="stat-value">{summary.total}</div>
            <div className="stat-label">إجمالي الامتحانات</div>
          </div>
          <div className="stat-card info">
            <div className="stat-icon">👥</div>
            <div className="stat-value">{summary.students}</div>
            <div className="stat-label">إجمالي الطلبة</div>
          </div>
          <div className="stat-card success">
            <div className="stat-icon">✅</div>
            <div className="stat-value">{summary.assigned}</div>
            <div className="stat-label">تم التوزيع</div>
          </div>
          <div className="stat-card warning">
            <div className="stat-icon">⚠️</div>
            <div className="stat-value">{summary.review}</div>
            <div className="stat-label">يحتاج مراجعة</div>
          </div>
          <div className="stat-card danger">
            <div className="stat-icon">❌</div>
            <div className="stat-value">{summary.conflicts}</div>
            <div className="stat-label">تعارضات</div>
          </div>
          <div className="stat-card danger">
            <div className="stat-icon">📉</div>
            <div className="stat-value">{summary.capIssue}</div>
            <div className="stat-label">سعة غير كافية</div>
          </div>
        </div>
      )}

      {/* Preview Table */}
      {rows.length > 0 && (
        <div className="table-container">
          <div className="table-header">
            <span style={{ fontWeight: 700 }}>📋 معاينة الجدول — {rows.length} سطر</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>رقم المادة</th>
                  <th>ش</th>
                  <th>اسم المادة</th>
                  <th>المحاضر</th>
                  <th>الطلبة</th>
                  <th>طبيعة</th>
                  <th>منصة</th>
                  <th>اليوم</th>
                  <th>التاريخ</th>
                  <th>الوقت</th>
                  <th>المختبرات المقترحة</th>
                  <th>السعة</th>
                  <th>الحالة</th>
                  <th>ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Group rows by date + start_time + end_time for visual separators
                  const elements = [];
                  let lastGroupKey = null;
                  let groupColor = 0;

                  const GROUP_COLORS = [
                    'rgba(99, 102, 241, 0.06)',   // indigo tint
                    'rgba(14, 165, 233, 0.06)',   // sky tint
                    'rgba(16, 185, 129, 0.06)',   // green tint
                    'rgba(245, 158, 11, 0.06)',   // amber tint
                    'rgba(244, 63, 94, 0.06)',    // rose tint
                  ];

                  rows.forEach((row, i) => {
                    const gKey = `${row.exam_date}||${row.start_time}||${row.end_time}`;
                    const isNewGroup = gKey !== lastGroupKey;

                    if (isNewGroup && lastGroupKey !== null) {
                      // Blue separator row between groups
                      elements.push(
                        <tr key={`sep-${i}`}>
                          <td colSpan={15} style={{
                            background: 'linear-gradient(90deg, var(--primary), var(--accent))',
                            height: 3,
                            padding: 0,
                            border: 'none',
                          }} />
                        </tr>
                      );
                      groupColor = (groupColor + 1) % GROUP_COLORS.length;
                    }

                    if (isNewGroup) lastGroupKey = gKey;

                    const labs    = parseJson(row.assigned_labs, []);
                    const warns   = parseJson(row.warnings, []);
                    const errs    = parseJson(row.errors, []);
                    const st      = STATUS_BADGE[row.status] || { cls: 'badge-gray', label: row.status };
                    const timeStr = row.start_time && row.end_time
                      ? `${row.start_time?.slice(0,5)} - ${row.end_time?.slice(0,5)}`
                      : '—';
                    const totalCap = labs.reduce((s, l) => s + (l.capacity || 0), 0);
                    const diff     = totalCap - (row.student_count || 0);

                    elements.push(
                      <tr key={row.id}
                        style={{
                          background: row.status === 'invalid' ? 'rgba(244,63,94,0.04)' : GROUP_COLORS[groupColor],
                          opacity: row.status === 'invalid' ? .6 : 1,
                        }}
                      >
                        <td style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>{row.row_number}</td>
                        <td><code style={{ fontSize: '.82rem' }}>{row.course_code}</code></td>
                        <td>{row.section_number || '—'}</td>
                        <td style={{ maxWidth: 160 }}>{row.course_name}</td>
                        <td style={{ maxWidth: 140, fontSize: '.85rem' }}>{row.instructor_name || '—'}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{row.student_count}</td>
                        <td>{row.exam_type || '—'}</td>
                        <td>{row.platform || '—'}</td>
                        <td>{row.day || '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{row.exam_date || '—'}</td>
                        <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{timeStr}</td>
                        <td style={{ maxWidth: 220 }}>
                          {labs.length > 0
                            ? labs.map((l, li) => {
                                const pb = PRIORITY_BADGE[l.priority_group] || PRIORITY_BADGE.other;
                                return (
                                  <span key={li} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 3, marginLeft: 6 }}>
                                    <span className={`badge ${pb.cls}`} style={{ fontSize: '.68rem' }}>{pb.label}</span>
                                    <span style={{ fontSize: '.82rem', fontWeight: 600 }}>{l.lab_name}</span>
                                    {l.capacity ? <span style={{ color: 'var(--text-muted)', fontSize: '.72rem' }}>({l.capacity})</span> : null}
                                  </span>
                                );
                              })
                            : <span style={{ color: 'var(--text-muted)' }}>—</span>
                          }
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {totalCap > 0 && (
                            <span style={{
                              color: diff >= 0 ? 'var(--success)' : 'var(--danger)',
                              fontWeight: 700,
                              fontSize: '.85rem',
                            }}>
                              {totalCap}
                              <span style={{ fontSize: '.72rem', fontWeight: 400 }}>
                                {diff >= 0 ? ` (+${diff})` : ` (${diff})`}
                              </span>
                            </span>
                          )}
                          {totalCap === 0 && '—'}
                        </td>
                        <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                        <td style={{ maxWidth: 200, fontSize: '.8rem' }}>
                          {errs.length > 0 && (
                            <div style={{ color: 'var(--danger)' }}>
                              {errs.map((e, ei) => <div key={ei}>❌ {e}</div>)}
                            </div>
                          )}
                          {warns.length > 0 && (
                            <div style={{ color: 'var(--warning)', marginTop: errs.length ? 4 : 0 }}>
                              {warns.map((w, wi) => <div key={wi}>⚠️ {w}</div>)}
                            </div>
                          )}
                          {!errs.length && !warns.length && '—'}
                        </td>
                      </tr>
                    );
                  });

                  return elements;
                })()}

              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && !loading && (
        <div className="empty-state">
          <div className="empty-state-icon">🖥️</div>
          <h3>لا توجد بيانات بعد</h3>
          <p>ارفع ملف Excel للامتحانات النهائية ثم اضغط "قراءة ومعاينة الملف"</p>
        </div>
      )}
    </div>
  );
}

function parseJson(val, fallback) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}
