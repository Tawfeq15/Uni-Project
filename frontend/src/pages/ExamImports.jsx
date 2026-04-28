import React, { useState, useEffect, useRef } from 'react';
import { examImportsAPI } from '../api';
import { useToast } from '../components/Toast';

const FACULTY_OPTIONS = [
  { value: 'all', label: 'كل الكليات' },
  { value: 'it', label: 'مختبرات IT' },
  { value: 'library', label: 'مختبرات المكتبة' },
  { value: 'media', label: 'مختبرات الإعلام' },
  { value: 'literature', label: 'مختبرات الآداب' },
  { value: 'law', label: 'مختبرات الحقوق' },
  { value: 'architecture', label: 'مختبرات العمارة' },
];

function formatDateTime(dt) {
  if (!dt) return '-';
  return new Date(dt).toLocaleString('ar-EG', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function ExamImports() {
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  
  // Import settings
  const [faculty, setFaculty] = useState('it');
  const [academicYear, setAcademicYear] = useState('2025-2026');
  const [semester, setSemester] = useState('First');
  const [examPeriod, setExamPeriod] = useState('Midterm');
  
  // Preview State
  const [previewData, setPreviewData] = useState(null);
  const [importRows, setImportRows] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [importMode, setImportMode] = useState('import_new');

  const fileRef = useRef();
  const toast = useToast();

  // Mapping State
  const [needsMapping, setNeedsMapping] = useState(false);
  const [fileHeaders, setFileHeaders] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});

  useEffect(() => {
    loadImports();
  }, []);

  async function loadImports() {
    setLoading(true);
    try {
      const data = await examImportsAPI.list();
      setImports(Array.isArray(data.imports) ? data.imports : []);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) { setSelectedFile(file); setPreviewData(null); setNeedsMapping(false); }
  };

  async function handlePreview(overrideMapping = null) {
    if (!selectedFile) return toast('يجب اختيار ملف', 'warning');
    if (!faculty) return toast('يجب تحديد الكلية/المبنى', 'warning');

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('faculty', faculty);
      formData.append('academic_year', academicYear);
      formData.append('semester', semester);
      formData.append('exam_period', examPeriod);
      
      if (overrideMapping) {
        formData.append('column_mapping', JSON.stringify(overrideMapping));
      }

      const result = await examImportsAPI.preview(formData);
      
      if (result.needs_mapping) {
        setNeedsMapping(true);
        setFileHeaders(result.headers || []);
        toast(result.message || 'يرجى تحديد الأعمدة يدويًا', 'warning');
        return;
      }
      
      if (result.success) {
        setNeedsMapping(false);
        toast(`✅ تم معاينة ${result.total} صف. ${result.valid} صحيح و ${result.invalid} غير صالح.`, 'success');
        setPreviewData(result);
        
        // Fetch rows to show
        const showResult = await examImportsAPI.show(result.import_id);
        setImportRows(showResult.rows || []);
      } else {
        throw new Error(result.error || result.message || 'فشل التحليل');
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  async function submitMapping() {
    // Validate required mappings
    const required = ['course_code', 'date', 'rooms', 'start_time'];
    for (const req of required) {
      if (columnMapping[req] === undefined || columnMapping[req] === '') {
        return toast('يجب تحديد الأعمدة الأساسية (كود المادة، التاريخ، القاعات، الوقت)', 'error');
      }
    }
    handlePreview(columnMapping);
  }

  async function handleConfirm() {
    if (!previewData || !previewData.import_id) return;
    setConfirming(true);
    try {
      const result = await examImportsAPI.confirm({
        import_id: previewData.import_id,
        mode: importMode
      });
      if (result.success) {
        toast(`✅ تم استيراد وحجز ${result.imported} امتحان بنجاح!`, 'success');
        setPreviewData(null);
        setSelectedFile(null);
        setNeedsMapping(false);
        if (fileRef.current) fileRef.current.value = '';
        loadImports();
      } else {
        throw new Error(result.error || result.message || 'فشل الاستيراد');
      }
    } catch(e) {
      toast(e.message, 'error');
    } finally {
      setConfirming(false);
    }
  }

  async function handleCancelPreview() {
    if (!previewData || !previewData.import_id) return;
    try {
      await examImportsAPI.delete(previewData.import_id);
      setPreviewData(null);
      setSelectedFile(null);
      setNeedsMapping(false);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      console.error('Failed to cancel preview', e);
    }
  }

  async function handleDelete(id) {
    if (!confirm('هل أنت متأكد من مسح سجل الاستيراد هذا؟ (لن يمسح الحجوزات الفعلية، بل السجل فقط)')) return;
    try {
      await examImportsAPI.delete(id);
      toast('تم الحذف بنجاح', 'success');
      loadImports();
    } catch(e) {
      toast(e.message, 'error');
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">📥 استيراد جداول الكليات</h1>
          <p className="page-subtitle">رفع جداول الاختبارات للكليات الأخرى وحجز المختبرات تلقائياً</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadImports}>🔄 تحديث</button>
      </div>

      <div className="card mb-4">
        <div className="card-header">
          <h3 className="card-title">إعدادات ملف الاستيراد</h3>
        </div>
        <div className="form-row" style={{ marginBottom: 20 }}>
          <div className="form-group">
            <label className="form-label">الكلية / المبنى المستهدف</label>
            <select className="form-control" value={faculty} onChange={e => setFaculty(e.target.value)}>
              {FACULTY_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">العام الجامعي</label>
            <input type="text" className="form-control" value={academicYear} onChange={e => setAcademicYear(e.target.value)} />
          </div>
        </div>
        <div className="form-row" style={{ marginBottom: 20 }}>
          <div className="form-group">
            <label className="form-label">الفصل الدراسي</label>
            <select className="form-control" value={semester} onChange={e => setSemester(e.target.value)}>
              <option value="First">الأول (First)</option>
              <option value="Second">الثاني (Second)</option>
              <option value="Summer">الصيفي (Summer)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">فترة الامتحانات</label>
            <select className="form-control" value={examPeriod} onChange={e => setExamPeriod(e.target.value)}>
              <option value="Midterm">نصفية (Midterm)</option>
              <option value="Final">نهائية (Final)</option>
              <option value="Make-up">تعويضية / غير مكتمل</option>
            </select>
          </div>
        </div>

        {!previewData && !needsMapping && (
          <>
            <div
              className={`upload-zone ${dragging ? 'dragging' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <div className="upload-zone-icon">📁</div>
              {selectedFile ? (
                <>
                  <div className="upload-zone-text" style={{ color: 'var(--success)', fontWeight: 600 }}>✅ {selectedFile.name}</div>
                  <div className="upload-zone-hint">{(selectedFile.size / 1024).toFixed(0)} KB</div>
                </>
              ) : (
                <>
                  <div className="upload-zone-text">اسحب ملف Excel الخاص بالجدول هنا أو انقر للاختيار</div>
                  <div className="upload-zone-hint">يجب أن يحتوي الملف على أعمدة: كود المادة، اسم المادة، الشعب، القاعات، التاريخ، من، إلى، الطلاب</div>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={e => { setSelectedFile(e.target.files[0]); setPreviewData(null); setNeedsMapping(false); }}
              />
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
              <button
                className="btn btn-primary"
                onClick={() => handlePreview(null)}
                disabled={uploading || !selectedFile}
              >
                {uploading ? <><span className="spinner spinner-sm"></span> جاري القراءة...</> : '📄 قراءة ومعاينة الملف'}
              </button>
            </div>
          </>
        )}

        {needsMapping && !previewData && (
          <div className="animate-fade-in" style={{ padding: 20, background: 'rgba(234,179,8,0.05)', borderRadius: 8, border: '1px solid var(--warning)' }}>
            <h3 style={{ color: 'var(--warning)', marginBottom: 15 }}>⚠️ لم يتم التعرف على بعض الأعمدة الأساسية</h3>
            <p style={{ marginBottom: 20 }}>يرجى مطابقة أعمدة الملف مع الحقول المطلوبة للنظام:</p>
            
            <div className="form-row" style={{ marginBottom: 15 }}>
              {[
                { key: 'course_code', label: 'كود المادة *', req: true },
                { key: 'date', label: 'التاريخ *', req: true },
                { key: 'start_time', label: 'الوقت (أو وقت البداية) *', req: true },
                { key: 'rooms', label: 'القاعات *', req: true }
              ].map(field => (
                <div className="form-group" key={field.key}>
                  <label className="form-label" style={{ color: field.req ? 'var(--danger)' : 'inherit' }}>{field.label}</label>
                  <select 
                    className="form-control" 
                    value={columnMapping[field.key] || ''} 
                    onChange={e => setColumnMapping({...columnMapping, [field.key]: e.target.value})}
                  >
                    <option value="">-- اختر العمود --</option>
                    {fileHeaders.map((h, i) => (
                      <option key={i} value={i}>{h || `(عمود فارغ ${i})`}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="form-row" style={{ marginBottom: 20 }}>
              {[
                { key: 'course_name', label: 'اسم المادة' },
                { key: 'sections', label: 'الشعب' },
                { key: 'end_time', label: 'وقت النهاية (اختياري)' },
                { key: 'instructors', label: 'المحاضر' },
                { key: 'student_count', label: 'عدد الطلبة' }
              ].map(field => (
                <div className="form-group" key={field.key}>
                  <label className="form-label">{field.label}</label>
                  <select 
                    className="form-control" 
                    value={columnMapping[field.key] || ''} 
                    onChange={e => setColumnMapping({...columnMapping, [field.key]: e.target.value})}
                  >
                    <option value="">-- تخطي --</option>
                    {fileHeaders.map((h, i) => (
                      <option key={i} value={i}>{h || `(عمود فارغ ${i})`}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={submitMapping} disabled={uploading}>
                {uploading ? 'جاري القراءة...' : 'إكمال القراءة بالترتيب المحدد'}
              </button>
              <button className="btn btn-secondary" onClick={() => { setNeedsMapping(false); setColumnMapping({}); }}>
                إلغاء
              </button>
            </div>
          </div>
        )}

        {previewData && (
          <div className="animate-fade-in" style={{ padding: 20, background: 'rgba(99,102,241,0.05)', borderRadius: 8, border: '1px solid var(--primary)' }}>
            <h3 style={{ color: 'var(--primary)', marginBottom: 15 }}>📋 معاينة الاستيراد</h3>
            
            <div style={{ display: 'flex', gap: 15, marginBottom: 20 }}>
              <div className="badge badge-gray" style={{ fontSize: '1rem', padding: '10px 15px' }}>الإجمالي: {previewData.total}</div>
              <div className="badge badge-success" style={{ fontSize: '1rem', padding: '10px 15px' }}>صالح: {previewData.valid}</div>
              {previewData.warning > 0 && <div className="badge badge-warning" style={{ fontSize: '1rem', padding: '10px 15px' }}>تحذيرات: {previewData.warning}</div>}
              {previewData.conflict > 0 && <div className="badge badge-danger" style={{ fontSize: '1rem', padding: '10px 15px', backgroundColor: 'var(--warning)', color: '#fff' }}>تعارضات: {previewData.conflict}</div>}
              <div className="badge badge-danger" style={{ fontSize: '1rem', padding: '10px 15px' }}>أخطاء: {previewData.invalid}</div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label className="form-label">كيف تريد التعامل مع الحجوزات الموجودة مسبقًا لنفس المادة؟</label>
              <select className="form-control" value={importMode} onChange={e => setImportMode(e.target.value)} style={{ maxWidth: 400 }}>
                <option value="import_new">تخطي المكرر (استيراد المواد الجديدة فقط)</option>
                <option value="replace_existing">استبدال المكرر (حذف الحجز القديم وإنشاء حجز جديد)</option>
              </select>
            </div>

            <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 20, border: '1px solid var(--border)', borderRadius: 6 }}>
              <table style={{ fontSize: '0.8rem', width: '100%' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-lighter)' }}>
                  <tr>
                    <th>الصف</th>
                    <th>كود المادة</th>
                    <th>القاعات</th>
                    <th>التاريخ والوقت</th>
                    <th>الحالة</th>
                    <th>الملاحظات/الأخطاء</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map(r => {
                    let bg = 'transparent';
                    if (r.status === 'invalid') bg = 'rgba(239,68,68,0.05)';
                    if (r.status === 'warning') bg = 'rgba(234,179,8,0.1)';
                    if (r.status === 'conflict') bg = 'rgba(249,115,22,0.1)';

                    return (
                      <tr key={r.id} style={{ background: bg }}>
                        <td>{r.row_number}</td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.course_code}</td>
                        <td>{JSON.parse(r.rooms || '[]').join('، ')}</td>
                        <td>{r.exam_date || r.day} | {r.start_time}-{r.end_time}</td>
                        <td>
                          {r.status === 'valid' && <span className="badge badge-success">جاهز</span>}
                          {r.status === 'warning' && <span className="badge badge-warning">تحذير</span>}
                          {r.status === 'conflict' && <span className="badge" style={{ background: 'var(--warning)', color: '#fff' }}>تعارض</span>}
                          {r.status === 'invalid' && <span className="badge badge-danger">خطأ</span>}
                        </td>
                        <td style={{ fontSize: '0.75rem', maxWidth: 200 }}>
                          {r.status === 'warning' && <div style={{ color: '#854d0e' }}>{JSON.parse(r.warnings || '[]').join('، ')}</div>}
                          {r.status === 'conflict' && <div style={{ color: '#9a3412' }}>{JSON.parse(r.errors || '[]').join('، ')}</div>}
                          {r.status === 'invalid' && <div style={{ color: 'var(--danger)' }}>{JSON.parse(r.errors || '[]').join('، ')}</div>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-success" onClick={handleConfirm} disabled={confirming || previewData.valid === 0}>
                {confirming ? 'جاري الاستيراد...' : `✅ تأكيد استيراد وحجز (${previewData.valid + previewData.warning + previewData.conflict}) صفوف`}
              </button>
              <button className="btn btn-secondary" onClick={handleCancelPreview} disabled={confirming}>
                إلغاء
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="table-container">
        <div className="table-header">
          <h3 className="card-title">📂 سجل الاستيراد</h3>
          <span className="badge badge-gray">{imports.length} عمليات</span>
        </div>
        {loading ? <div className="spinner"></div> : imports.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <h3>لا توجد عمليات استيراد سابقة</h3>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>اسم الملف</th>
                <th>المبنى</th>
                <th>الفترة</th>
                <th>الصفوف المستوردة</th>
                <th>الحالة</th>
                <th>تاريخ الاستيراد</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((im, i) => (
                <tr key={im.id}>
                  <td className="text-muted">{im.id}</td>
                  <td style={{ fontWeight: 600 }}>{im.original_filename}</td>
                  <td><span className="badge badge-primary">{im.faculty}</span></td>
                  <td>{im.academic_year} - {im.semester} - {im.exam_period}</td>
                  <td>
                    <span className="badge badge-info">{im.imported_rows || 0} / {im.total_rows || 0}</span>
                  </td>
                  <td>
                    <span className={`badge ${im.status === 'imported' ? 'badge-success' : 'badge-warning'}`}>
                      {im.status === 'imported' ? 'مكتمل' : 'معاينة'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>{formatDateTime(im.created_at)}</td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(im.id)}>🗑️ سجل</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
