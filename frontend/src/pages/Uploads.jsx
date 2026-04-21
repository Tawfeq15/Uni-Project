import React, { useState, useEffect, useRef } from 'react';
import { uploadsAPI } from '../api';
import { useToast } from '../components/Toast';

const FACULTY_LABELS = {
  it: '🖥️ مبنى IT',
  library: '📚 مبنى المكتبة',
  mixed: '🏢 IT + المكتبة',
  unknown: '❓ غير محدد',
};

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];
const EXCEL_EXTS = ['.xlsx', '.xls'];

function formatDateTime(dt) {
  if (!dt) return '-';
  return new Date(dt).toLocaleString('ar-EG', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const API_BASE = '/api';

export default function Uploads() {
  const [files, setFiles]                 = useState([]);
  const [loading, setLoading]             = useState(true);
  const [uploading, setUploading]         = useState(false);
  const [dragging, setDragging]           = useState(false);
  const [selectedFile, setSelectedFile]   = useState(null);
  const [visionStatus, setVisionStatus]   = useState(null);
  const [visionPreview, setVisionPreview] = useState(null);
  const [uploadResult, setUploadResult]   = useState(null);
  const fileRef = useRef();
  const toast = useToast();

  useEffect(() => {
    loadFiles();
    checkVisionStatus();
  }, []);

  async function checkVisionStatus() {
    try {
      const r = await fetch(`${API_BASE}/vision/status`);
      const d = await r.json();
      setVisionStatus(d);
    } catch {}
  }

  async function loadFiles() {
    setLoading(true);
    try {
      const data = await uploadsAPI.list();
      setFiles(Array.isArray(data) ? data : []);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function isImage(file) {
    if (!file) return false;
    return IMAGE_EXTS.some(ext => file.name.toLowerCase().endsWith(ext));
  }

  async function handleUpload() {
    if (!selectedFile) return toast('يجب اختيار ملف', 'warning');

    setUploading(true);
    setVisionPreview(null);
    setUploadResult(null);

    try {
      if (isImage(selectedFile)) {
        // Image → Gemini Vision — needs a faculty hint
        // We'll use 'library' as default hint since it can contain both
        const formData = new FormData();
        formData.append('image', selectedFile);
        formData.append('faculty', 'library'); // hint only, auto-detected internally
        const r = await fetch(`${API_BASE}/vision/parse-image`, { method: 'POST', body: formData });
        const result = await r.json();
        if (!r.ok) throw new Error(result.error || 'فشل تحليل الصورة');
        toast(`✅ ${result.message}`, 'success');
        if (result.preview) setVisionPreview(result);
        setUploadResult(result);
      } else {
        // Excel → auto-detect faculty from rooms
        const formData = new FormData();
        formData.append('file', selectedFile);
        // No faculty field required — backend auto-detects!
        const result = await uploadsAPI.upload(formData);
        if (result.success) {
          const facLabel = result.faculties_detected?.map(f => FACULTY_LABELS[f] || f).join(' + ') || '';
          toast(`✅ تم تحليل ${result.sessions_count || 0} جلسة${facLabel ? ' — ' + facLabel : ''}`, 'success');
          setUploadResult(result);
        } else {
          throw new Error(result.error || 'فشل الرفع');
        }
      }
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = '';
      loadFiles();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('هل تريد حذف هذا الملف وجميع بياناته؟')) return;
    try {
      await uploadsAPI.delete(id);
      toast('تم الحذف بنجاح', 'success');
      loadFiles();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function handleReparse(id) {
    try {
      const result = await uploadsAPI.reparse(id);
      toast(`إعادة التحليل: ${result.sessions_count} جلسة`, 'success');
      loadFiles();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) { setSelectedFile(file); setUploadResult(null); }
  };

  const fileIsImage = isImage(selectedFile);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">📤 رفع جداول المحاضرات</h1>
          <p className="page-subtitle">ارفع ملف Excel أو صورة جدول — يتم اكتشاف القاعات والمبنى تلقائياً</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadFiles}>🔄 تحديث</button>
      </div>

      {/* Vision status banner */}
      {visionStatus && (
        <div className={`alert ${visionStatus.configured ? 'alert-success' : 'alert-warning'}`} style={{ marginBottom: 20 }}>
          🤖 {visionStatus.message}
          {!visionStatus.configured && (
            <span style={{ marginRight: 8, fontSize: '0.78rem', opacity: 0.85 }}>
              — افتح <code>backend/.env</code> وأضف <code>GEMINI_API_KEY=مفتاحك</code>
            </span>
          )}
        </div>
      )}

      {/* Auto-detect notice */}
      <div className="alert alert-info" style={{ marginBottom: 20 }}>
        🔍 <strong>اكتشاف تلقائي:</strong> لا تحتاج لتحديد الكلية — النظام يكتشف القاعات تلقائياً من أرقامها.
        قاعات <strong>21xx</strong> = مبنى المكتبة &nbsp;|&nbsp;
        قاعات <strong>74xx / 7325</strong> = مبنى IT.
      </div>

      {/* Upload form */}
      <div className="card mb-4">
        <div className="card-header">
          <h3 className="card-title">رفع ملف جديد</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="badge badge-info">📊 Excel</span>
            <span className="badge badge-primary">🖼️ صورة (AI)</span>
          </div>
        </div>

        {/* Drop zone */}
        <div
          className={`upload-zone ${dragging ? 'dragging' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          style={fileIsImage ? { borderColor: 'var(--primary)', background: 'var(--primary-glow)' } : {}}
        >
          <div className="upload-zone-icon">{fileIsImage ? '🖼️' : '📁'}</div>
          {selectedFile ? (
            <>
              <div className="upload-zone-text" style={{ color: fileIsImage ? 'var(--primary)' : 'var(--success)', fontWeight: 600 }}>
                {fileIsImage ? '🤖 صورة جدول — سيتم تحليلها بالذكاء الاصطناعي' : '✅ ' + selectedFile.name}
              </div>
              {fileIsImage && (
                <div className="upload-zone-text" style={{ fontSize: '0.82rem', marginTop: 4, opacity: 0.8 }}>{selectedFile.name}</div>
              )}
              <div className="upload-zone-hint">{(selectedFile.size / 1024).toFixed(0)} KB</div>
            </>
          ) : (
            <>
              <div className="upload-zone-text">اسحب الملف هنا أو انقر للاختيار</div>
              <div className="upload-zone-hint">
                يدعم: .xlsx، .xls (Excel) &nbsp;|&nbsp; .png، .jpg، .jpeg (صورة بالذكاء الاصطناعي)
              </div>
              <div className="upload-zone-hint" style={{ marginTop: 4, color: 'var(--accent)' }}>
                🔑 القاعة والمبنى يُكتشفان تلقائياً — لا تحتاج لاختيار أي شيء!
              </div>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.png,.jpg,.jpeg,.webp"
            style={{ display: 'none' }}
            onChange={e => { setSelectedFile(e.target.files[0]); setVisionPreview(null); setUploadResult(null); }}
          />
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={uploading || !selectedFile}
          >
            {uploading
              ? <><span className="spinner spinner-sm"></span> جاري {fileIsImage ? 'التحليل' : 'الرفع'}...</>
              : fileIsImage ? '🤖 تحليل بالذكاء الاصطناعي' : '📤 رفع وتحليل'
            }
          </button>
          {selectedFile && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedFile(null); setVisionPreview(null); setUploadResult(null); if (fileRef.current) fileRef.current.value = ''; }}>
              ✕ إلغاء
            </button>
          )}
          {fileIsImage && !visionStatus?.configured && (
            <span className="badge badge-warning">⚠️ يتطلب GEMINI_API_KEY</span>
          )}
        </div>
      </div>

      {/* Upload result summary */}
      {uploadResult && !visionPreview && (
        <div className="card" style={{ marginBottom: 20, borderColor: 'var(--success)', background: 'var(--success-bg)' }}>
          <div className="card-header">
            <h3 className="card-title" style={{ color: 'var(--success)' }}>✅ تم الرفع بنجاح</h3>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: '0.85rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>الجلسات المستخرجة</div>
              <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--accent)' }}>{uploadResult.sessions_count}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>القاعات المكتشفة</div>
              <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--accent)' }}>{uploadResult.rooms_count}</div>
            </div>
            {uploadResult.faculties_detected && (
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>المباني المكتشفة</div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  {uploadResult.faculties_detected.map(f => FACULTY_LABELS[f] || f).join(' + ')}
                </div>
              </div>
            )}
          </div>
          {uploadResult.stats && uploadResult.stats.skipped_rows_count > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
               <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                 ملاحظات الرفع (تم تجاهل {uploadResult.stats.skipped_rows_count} صف غير معتمد):
               </div>
               <ul style={{ fontSize: '0.75rem', color: 'var(--accent)', margin: 0, paddingRight: 20 }}>
                 {uploadResult.stats.skipped_reasons && uploadResult.stats.skipped_reasons.slice(0, 5).map((r, idx) => (
                   <li key={idx}>{r.replace('Skipped non-lab room:', 'تم تجاهل قاعة غير مخبرية (عادية):')}</li>
                 ))}
                 {uploadResult.stats.skipped_reasons?.length > 5 && (
                   <li>... و {uploadResult.stats.skipped_reasons.length - 5} ملاحظات أخرى</li>
                 )}
               </ul>
            </div>
          )}
        </div>
      )}

      {/* Vision preview result */}
      {visionPreview && (
        <div className="card" style={{ marginBottom: 20, borderColor: 'var(--primary)' }}>
          <div className="card-header">
            <h3 className="card-title">🤖 نتائج تحليل الصورة</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="badge badge-success">{visionPreview.sessions_count} جلسة</span>
              <span className="badge badge-info">{visionPreview.rooms_found?.length || 0} قاعة</span>
            </div>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
            القاعات المكتشفة: {visionPreview.rooms_found?.join('، ')}
          </p>
          {visionPreview.preview && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ fontSize: '0.78rem' }}>
                <thead><tr>
                  <th>القاعة</th><th>اليوم</th><th>من</th><th>إلى</th><th>المادة</th><th>المحاضر</th>
                </tr></thead>
                <tbody>
                  {visionPreview.preview.map((s, i) => (
                    <tr key={i}>
                      <td>{s.room}</td><td>{s.day}</td>
                      <td>{s.start_time}</td><td>{s.end_time}</td>
                      <td>{s.course_name}</td><td>{s.lecturer || '—'}</td>
                    </tr>
                  ))}
                  {visionPreview.sessions_count > 5 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      ... و {visionPreview.sessions_count - 5} جلسة أخرى
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Uploaded files list */}
      <div className="table-container">
        <div className="table-header">
          <h3 className="card-title">📂 الملفات المرفوعة</h3>
          <span className="badge badge-gray">{files.length} ملف</span>
        </div>

        {loading ? (
          <div className="spinner"></div>
        ) : files.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <h3>لا توجد ملفات مرفوعة</h3>
            <p>ارفع جدول المحاضرات لبدء تشغيل النظام</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>اسم الملف</th>
                <th>المبنى المكتشف</th>
                <th>الحالة</th>
                <th>التحليل</th>
                <th>الجلسات</th>
                <th>تاريخ الرفع</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f, i) => (
                <tr key={f.id}>
                  <td className="text-muted">{i + 1}</td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                      {f.stored_path === 'manual_entry' ? '📋 ' : ''}{f.original_name}
                    </div>
                    {f.error_message && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: 2 }}>
                        ⚠️ {f.error_message}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="badge badge-primary">
                      {FACULTY_LABELS[f.faculty] || f.faculty}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${f.is_active ? 'success' : 'gray'}`}>
                      {f.is_active ? '🟢 نشط' : '⚫ غير نشط'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${
                      f.parse_status === 'success' ? 'success' :
                      f.parse_status === 'error' ? 'danger' : 'warning'
                    }`}>
                      {f.parse_status === 'success' ? '✅ نجح' :
                       f.parse_status === 'error' ? '❌ فشل' : '⏳ معلق'}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                      {f.sessions_count || 0}
                    </span>
                  </td>
                  <td className="text-secondary" style={{ fontSize: '0.78rem' }}>
                    {formatDateTime(f.uploaded_at)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {f.stored_path !== 'manual_entry' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleReparse(f.id)}
                          title="إعادة تحليل"
                        >🔄</button>
                      )}
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(f.id)}
                        title="حذف"
                      >🗑️</button>
                    </div>
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
