import React, { useState, useEffect, useRef } from 'react';
import { finalComputerizedImportsAPI } from '../api';
import { useToast } from '../components/Toast';

function parseJson(val,fallback){
  if(!val)return fallback;if(typeof val==='object')return val;
  try{return JSON.parse(val);}catch{return fallback;}
}

export default function FinalComputerizedImport() {
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState('');
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [importId, setImportId] = useState(null);
  const [rows, setRows] = useState([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState({
    academic_year: '2025-2026', semester: 'First', exam_period: 'Final',
    library_threshold: 400
  });

  const fileRef = useRef();
  const toast = useToast();

  useEffect(() => { loadImports(); }, []);

  const loadImports = async () => {
    setLoading('imports');
    const res = await finalComputerizedImportsAPI.list();
    setLoading('');
    if (res.success) setImports(res.imports || []);
    else toast(res.message || 'فشل تحميل السجل', 'error');
  };

  const loadRows = async (id) => {
    setLoading('rows');
    const res = await finalComputerizedImportsAPI.rows(id);
    setLoading('');
    if (res.success) setRows(res.data || []);
    else toast(res.message || 'فشل تحميل التفاصيل', 'error');
  };

  const handlePreview = async () => {
    if (!file) { toast('اختر ملف Excel أولاً', 'warning'); return; }
    setLoading('preview');
    const fd = new FormData(); fd.append('file', file);
    Object.entries(form).forEach(([k, v]) => v && fd.append(k, v));
    const res = await finalComputerizedImportsAPI.preview(fd);
    setLoading('');
    if (res.success) {
      setImportId(res.import_id);
      await loadRows(res.import_id);
      toast('تم قراءة ' + res.total_rows + ' سطر بنجاح', 'success');
      setCurrentStep(2);
    } else toast(res.message || 'فشل في قراءة الملف', 'error');
  };

  const handleAssign = async () => {
    if (!importId) { toast('قم بقراءة الملف أولاً', 'warning'); return; }
    setLoading('assign');
    const res = await finalComputerizedImportsAPI.assignLabs(importId);
    setLoading('');
    if (res.success) {
      await loadRows(importId);
      toast('تم توزيع المختبرات: ' + res.assigned + ' ✓  يحتاج مراجعة: ' + res.needs_review, 'success');
      setCurrentStep(3);
    } else toast(res.message || 'فشل في التوزيع', 'error');
  };

  const handleConfirm = async () => {
    if (!importId) { toast('قم بالتوزيع أولاً', 'warning'); return; }
    if (!window.confirm('هل تريد تأكيد واعتماد الجدول؟')) return;
    setLoading('confirm');
    const res = await finalComputerizedImportsAPI.confirm(importId);
    setLoading('');
    if (res.success) {
      await loadRows(importId);
      toast('تم اعتماد ' + res.imported + ' امتحان بنجاح', 'success');
    } else toast(res.message || 'فشل في الاعتماد', 'error');
  };

  const handleExport = () => {
    if (!importId) { toast('قم بالتوزيع أولاً', 'warning'); return; }
    finalComputerizedImportsAPI.exportExcel(importId);
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0]; if (f) setFile(f);
  };

  const calcSummary = () => {
    let valid = 0, warning = 0, conflict = 0, total = rows.length;
    rows.forEach(r => {
      if (r.status === 'valid') valid++;
      else if (r.status === 'warning') warning++;
      else if (r.status === 'conflict') conflict++;
    });
    return { valid, warning, conflict, total };
  };

  const summary = calcSummary();

  return (
    <div className="page" style={{ animation: 'fadeInUp .4s ease-out' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">🖥️ استيراد الامتحانات النهائية المحوسبة</h1>
          <p className="page-subtitle">رفع جدول الامتحانات النهائية وتوزيع المختبرات تلقائيًا حسب الأولوية والسعة</p>
        </div>
      </div>

      <div className="stepper" style={{ marginBottom: 24 }}>
        <div className={`step ${currentStep >= 1 ? 'active' : ''}`}>
          <div className="step-circle">1</div>
          <div className="step-label">رفع وقراءة الملف</div>
        </div>
        <div className={`step-line ${currentStep >= 2 ? 'active' : ''}`}></div>
        <div className={`step ${currentStep >= 2 ? 'active' : ''}`}>
          <div className="step-circle">2</div>
          <div className="step-label">توزيع المختبرات الذكي</div>
        </div>
        <div className={`step-line ${currentStep >= 3 ? 'active' : ''}`}></div>
        <div className={`step ${currentStep >= 3 ? 'active' : ''}`}>
          <div className="step-circle">3</div>
          <div className="step-label">مراجعة واعتماد</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">⚙️ إعدادات الاستيراد والتوزيع</span>
        </div>
        <div className="form-row" style={{ marginBottom: 20 }}>
          <div className="form-group">
            <label className="form-label">العام الجامعي</label>
            <input type="text" className="form-control" value={form.academic_year} onChange={e => setForm({ ...form, academic_year: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">الفصل الدراسي</label>
            <select className="form-control" value={form.semester} onChange={e => setForm({ ...form, semester: e.target.value })}>
              <option value="First">الأول</option>
              <option value="Second">الثاني</option>
              <option value="Summer">الصيفي</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">فترة الامتحان</label>
            <input type="text" className="form-control" value={form.exam_period} disabled />
          </div>
          <div className="form-group">
            <label className="form-label">سعة المكتبة (طالب)</label>
            <input type="number" className="form-control" value={form.library_threshold} onChange={e => setForm({ ...form, library_threshold: e.target.value })} />
          </div>
        </div>

        <div
          className={`upload-zone ${dragOver ? 'dragging' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="upload-zone-icon">{file ? '✅' : '📁'}</div>
          {file ? (
            <>
              <div className="upload-zone-text" style={{ color: 'var(--success)', fontWeight: 600 }}>{file.name}</div>
              <div className="upload-zone-hint">{(file.size / 1024).toFixed(0)} KB</div>
            </>
          ) : (
            <>
              <div className="upload-zone-text">اسحب ملف Excel هنا أو انقر للاختيار</div>
            </>
          )}
          <div className="upload-zone-hint">xlsx · xls — يجب أن يحتوي على ورقة FINAL أو الأولى</div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => { setFile(e.target.files[0]); setCurrentStep(1); }} />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={handlePreview} disabled={!!loading}>
            {loading === 'preview' ? <span className="spinner-sm"></span> : '🔍'} قراءة ومعاينة الملف
          </button>
          <button className="btn btn-secondary" onClick={handleAssign} disabled={!!loading || !importId}>
            {loading === 'assign' ? <span className="spinner-sm"></span> : '🤖'} توزيع المختبرات تلقائيًا
          </button>
          <button className="btn btn-success" onClick={handleConfirm} disabled={!!loading || !importId}>
            {loading === 'confirm' ? <span className="spinner-sm"></span> : '✅'} تأكيد واعتماد الجدول
          </button>
          <button className="btn btn-excel" onClick={handleExport} disabled={!importId} style={{ marginRight: 'auto' }}>
            📥 تصدير Excel
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card primary">
            <div className="stat-icon">📑</div>
            <div className="stat-value">{summary.total}</div>
            <div className="stat-label">إجمالي الامتحانات</div>
          </div>
          <div className="stat-card success">
            <div className="stat-icon">✅</div>
            <div className="stat-value">{summary.valid}</div>
            <div className="stat-label">جاهز للاعتماد</div>
          </div>
          <div className="stat-card warning">
            <div className="stat-icon">⚠️</div>
            <div className="stat-value">{summary.warning}</div>
            <div className="stat-label">تحتاج مراجعة سعة</div>
          </div>
          <div className="stat-card danger">
            <div className="stat-icon">❌</div>
            <div className="stat-value">{summary.conflict}</div>
            <div className="stat-label">تعارض مختبرات</div>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="table-container">
          <div className="table-header">
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>معاينة وتوزيع المختبرات</h3>
            <span className="badge badge-gray">{rows.length} امتحانات</span>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
            <table style={{ minWidth: 1100 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  <th style={{ width: 140 }}>المادة</th>
                  <th>الشعب والمحاضرين</th>
                  <th style={{ width: 160 }}>الوقت</th>
                  <th style={{ width: 300 }}>المختبرات المقترحة</th>
                  <th style={{ width: 100, textAlign: 'center' }}>الطلبة/السعة</th>
                  <th style={{ width: 100, textAlign: 'center' }}>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const labs = parseJson(row.assigned_labs, []);
                  const st = row.status;
                  const timeStr = row.start_time && row.end_time ? (row.start_time.slice(0, 5) + ' - ' + row.end_time.slice(0, 5)) : '—';
                  const totalCap = labs.reduce((s, l) => s + (l.capacity || 0), 0);
                  const diff = totalCap - (row.student_count || 0);

                  return (
                    <tr key={row.id} style={{ background: st === 'invalid' ? 'rgba(239,68,68,.07)' : 'transparent', opacity: st === 'invalid' ? 0.6 : 1 }}>
                      <td style={{ color: 'var(--text-muted)', fontSize: '.78rem' }}>{row.row_number}</td>
                      <td><code style={{ fontSize: '.82rem', color: 'var(--primary)', fontWeight: 700 }}>{row.course_code}</code></td>
                      <td>
                        <div style={{ fontSize: '.85rem', fontWeight: 600 }}>{row.course_name}</div>
                        <div style={{ fontSize: '.75rem', color: 'var(--text-secondary)' }}>شعب: {row.sections} | المحاضر: {row.instructors}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: '.85rem', fontWeight: 600 }}>{row.exam_date || row.day}</div>
                        <div style={{ fontSize: '.75rem', color: 'var(--accent)' }}>{timeStr}</div>
                      </td>
                      <td>
                        {labs.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                            {labs.map((l, li) => (
                              <span key={li} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 3, marginLeft: 6 }}>
                                <span className="badge badge-gray" style={{ fontSize: '.65rem' }}>{l.priority_group}</span>
                                <span style={{ fontSize: '.82rem', fontWeight: 600 }}>{l.lab_name}</span>
                                {l.capacity ? <span style={{ color: 'var(--text-muted)', fontSize: '.7rem' }}>({l.capacity})</span> : null}
                              </span>
                            ))}
                          </div>
                        ) : <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>لم يتم التوزيع</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {totalCap > 0 ? <span style={{ color: diff >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700, fontSize: '.85rem' }}>{totalCap}<span style={{ fontSize: '.72rem', fontWeight: 400 }}>({diff >= 0 ? '+' : ''}{diff})</span></span> : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}><span className={"badge " + (st === 'valid' ? 'badge-success' : st === 'conflict' ? 'badge-danger' : 'badge-warning')}>{st}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rows.length === 0 && loading !== 'rows' && (
        <div className="empty-state">
          <div className="empty-state-icon">🖥️</div>
          <h3>لا توجد بيانات بعد</h3>
          <p>ارفع ملف Excel للامتحانات النهائية ثم اضغط قراءة ومعاينة الملف</p>
        </div>
      )}
    </div>
  );
}
