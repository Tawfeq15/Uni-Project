import React, { useState, useEffect, useRef } from 'react';
import { examImportsAPI } from '../api';
import { useToast } from '../components/Toast';

function formatDateTime(dt) {
  if(!dt)return '-';
  return new Date(dt).toLocaleString('ar-EG',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}

export default function ExamImports() {
  const [imports, setImports]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [uploading, setUploading]       = useState(false);
  const [dragging, setDragging]         = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [academicYear, setAcademicYear] = useState('2025-2026');
  const [semester, setSemester]         = useState('First');
  const [examPeriod, setExamPeriod]     = useState('Midterm');
  const [previewData, setPreviewData]   = useState(null);
  const [importRows, setImportRows]     = useState([]);
  const [confirming, setConfirming]     = useState(false);
  const [importMode, setImportMode]     = useState('import_new');
  const [needsMapping, setNeedsMapping] = useState(false);
  const [fileHeaders, setFileHeaders]   = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const fileRef = useRef();
  const toast   = useToast();

  useEffect(()=>{loadImports();},[]);

  async function loadImports(){
    setLoading(true);
    try{const d=await examImportsAPI.list();setImports(Array.isArray(d.imports)?d.imports:[]);}
    catch(e){toast(e.message,'error');}finally{setLoading(false);}
  }

  const handleDrop=(e)=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f){setSelectedFile(f);setPreviewData(null);setNeedsMapping(false);}};

  async function handlePreview(overrideMapping=null){
    if(!selectedFile)return toast('يجب اختيار ملف','warning');
    setUploading(true);
    try{
      const fd=new FormData();fd.append('file',selectedFile);fd.append('faculty','all');fd.append('academic_year',academicYear);fd.append('semester',semester);fd.append('exam_period',examPeriod);
      if(overrideMapping)fd.append('column_mapping',JSON.stringify(overrideMapping));
      const result=await examImportsAPI.preview(fd);
      if(result.needs_mapping){setNeedsMapping(true);setFileHeaders(result.headers||[]);toast(result.message||'يرجى تحديد الأعمدة','warning');return;}
      if(result.success){setNeedsMapping(false);toast(`✅ ${result.total} صف — ${result.valid} صحيح، ${result.invalid} غير صالح`,'success');setPreviewData(result);const sr=await examImportsAPI.show(result.import_id);setImportRows(sr.rows||[]);}
      else throw new Error(result.error||result.message||'فشل التحليل');
    }catch(e){toast(e.message,'error');}finally{setUploading(false);}
  }

  async function submitMapping(){
    const req=['course_code','date','rooms','start_time'];
    for(const r of req){if(columnMapping[r]===undefined||columnMapping[r]==='')return toast('يجب تحديد الأعمدة الأساسية','error');}
    handlePreview(columnMapping);
  }

  async function handleConfirm(){
    if(!previewData||!previewData.import_id)return;
    setConfirming(true);
    try{
      const result=await examImportsAPI.confirm({import_id:previewData.import_id,mode:importMode});
      if(result.success){toast(`✅ تم استيراد وحجز ${result.imported} امتحان`,'success');setPreviewData(null);setSelectedFile(null);setNeedsMapping(false);if(fileRef.current)fileRef.current.value='';loadImports();}
      else throw new Error(result.error||result.message||'فشل الاستيراد');
    }catch(e){toast(e.message,'error');}finally{setConfirming(false);}
  }

  async function handleCancelPreview(){
    if(!previewData||!previewData.import_id)return;
    try{await examImportsAPI.delete(previewData.import_id);setPreviewData(null);setSelectedFile(null);setNeedsMapping(false);if(fileRef.current)fileRef.current.value='';}catch(e){console.error(e);}
  }

  async function handleDelete(id){
    if(!confirm('هل أنت متأكد من مسح سجل الاستيراد؟'))return;
    try{await examImportsAPI.delete(id);toast('تم الحذف بنجاح','success');loadImports();}catch(e){toast(e.message,'error');}
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">📥 استيراد جداول الكليات</h1>
          <p className="page-subtitle">رفع جداول الاختبارات للكليات وحجز المختبرات تلقائياً</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadImports}>🔄 تحديث</button>
      </div>

      <div className="card" style={{marginBottom:24}}>
        <div className="card-header">
          <span className="card-title">⚙️ إعدادات ملف الاستيراد</span>
        </div>
        <div className="form-row" style={{marginBottom:20}}>
          <div className="form-group">
            <label className="form-label">العام الجامعي</label>
            <input type="text" className="form-control" value={academicYear} onChange={e=>setAcademicYear(e.target.value)}/>
          </div>
          <div className="form-group">
            <label className="form-label">الفصل الدراسي</label>
            <select className="form-control" value={semester} onChange={e=>setSemester(e.target.value)}>
              <option value="First">الأول</option>
              <option value="Second">الثاني</option>
              <option value="Summer">الصيفي</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">فترة الامتحانات</label>
            <select className="form-control" value={examPeriod} onChange={e=>setExamPeriod(e.target.value)}>
              <option value="Midterm">نصفية</option>
              <option value="Final">نهائية</option>
              <option value="Make-up">تعويضية</option>
            </select>
          </div>
        </div>

        {!previewData&&!needsMapping&&(
          <>
            <div
              className={`upload-zone${dragging?' dragging':''}`}
              onClick={()=>fileRef.current?.click()}
              onDragOver={e=>{e.preventDefault();setDragging(true);}}
              onDragLeave={()=>setDragging(false)}
              onDrop={handleDrop}
            >
              <div className="upload-zone-icon">{selectedFile?'✅':'📁'}</div>
              {selectedFile?(
                <>
                  <div className="upload-zone-text" style={{color:'var(--success)',fontWeight:600}}>{selectedFile.name}</div>
                  <div className="upload-zone-hint">{(selectedFile.size/1024).toFixed(0)} KB</div>
                </>
              ):(
                <>
                  <div className="upload-zone-text">اسحب ملف Excel هنا أو انقر للاختيار</div>
                  <div className="upload-zone-hint">يجب أن يحتوي على: كود المادة، القاعات، التاريخ، الوقت</div>
                </>
              )}
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={e=>{setSelectedFile(e.target.files[0]);setPreviewData(null);setNeedsMapping(false);}}/>
            </div>
            <div style={{marginTop:16}}>
              <button className="btn btn-primary" onClick={()=>handlePreview(null)} disabled={uploading||!selectedFile}>
                {uploading?<><span className="spinner spinner-sm"></span> جاري القراءة...</>:'📄 قراءة ومعاينة الملف'}
              </button>
            </div>
          </>
        )}

        {needsMapping&&!previewData&&(
          <div style={{padding:20,background:'rgba(245,158,11,.06)',borderRadius:12,border:'1px solid rgba(245,158,11,.3)'}}>
            <h3 style={{color:'var(--warning)',marginBottom:14}}>⚠️ تحديد الأعمدة يدوياً</h3>
            <p style={{marginBottom:18,color:'var(--text-secondary)'}}>يرجى مطابقة أعمدة الملف مع الحقول المطلوبة:</p>
            <div className="form-row" style={{marginBottom:14}}>
              {[{key:'course_code',label:'كود المادة *'},{key:'date',label:'التاريخ *'},{key:'start_time',label:'وقت البداية *'},{key:'rooms',label:'القاعات *'}].map(f=>(
                <div className="form-group" key={f.key}>
                  <label className="form-label" style={{color:'var(--danger)'}}>{f.label}</label>
                  <select className="form-control" value={columnMapping[f.key]||''} onChange={e=>setColumnMapping({...columnMapping,[f.key]:e.target.value})}>
                    <option value="">-- اختر العمود --</option>
                    {fileHeaders.map((h,i)=><option key={i} value={i}>{h||`(عمود فارغ ${i})`}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="form-row" style={{marginBottom:18}}>
              {[{key:'course_name',label:'اسم المادة'},{key:'sections',label:'الشعب'},{key:'end_time',label:'وقت النهاية'},{key:'instructors',label:'المحاضر'},{key:'student_count',label:'عدد الطلبة'}].map(f=>(
                <div className="form-group" key={f.key}>
                  <label className="form-label">{f.label}</label>
                  <select className="form-control" value={columnMapping[f.key]||''} onChange={e=>setColumnMapping({...columnMapping,[f.key]:e.target.value})}>
                    <option value="">-- تخطي --</option>
                    {fileHeaders.map((h,i)=><option key={i} value={i}>{h||`(عمود فارغ ${i})`}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:10}}>
              <button className="btn btn-primary" onClick={submitMapping} disabled={uploading}>{uploading?'جاري القراءة...':'إكمال القراءة'}</button>
              <button className="btn btn-secondary" onClick={()=>{setNeedsMapping(false);setColumnMapping({});}}>إلغاء</button>
            </div>
          </div>
        )}

        {previewData&&(
          <div style={{padding:20,background:'rgba(99,102,241,.05)',borderRadius:14,border:'1px solid rgba(99,102,241,.2)'}}>
            <h3 style={{color:'var(--primary)',marginBottom:14}}>📋 معاينة الاستيراد</h3>
            <div style={{display:'flex',gap:12,marginBottom:18,flexWrap:'wrap'}}>
              <div className="badge badge-gray" style={{fontSize:'.9rem',padding:'8px 14px'}}>الإجمالي: {previewData.total}</div>
              <div className="badge badge-success" style={{fontSize:'.9rem',padding:'8px 14px'}}>صالح: {previewData.valid}</div>
              {previewData.warning>0&&<div className="badge badge-warning" style={{fontSize:'.9rem',padding:'8px 14px'}}>تحذيرات: {previewData.warning}</div>}
              {previewData.conflict>0&&<div className="badge badge-danger" style={{fontSize:'.9rem',padding:'8px 14px'}}>تعارضات: {previewData.conflict}</div>}
              <div className="badge badge-danger" style={{fontSize:'.9rem',padding:'8px 14px'}}>أخطاء: {previewData.invalid}</div>
            </div>
            <div style={{marginBottom:18}}>
              <label className="form-label">التعامل مع الحجوزات الموجودة:</label>
              <select className="form-control" value={importMode} onChange={e=>setImportMode(e.target.value)} style={{maxWidth:420}}>
                <option value="import_new">تخطي المكرر (استيراد الجديد فقط)</option>
                <option value="replace_existing">استبدال المكرر</option>
              </select>
            </div>
            <div style={{maxHeight:280,overflowY:'auto',marginBottom:18,border:'1px solid var(--border)',borderRadius:12}}>
              <table style={{fontSize:'.8rem',width:'100%'}}>
                <thead style={{position:'sticky',top:0,background:'rgba(17,24,39,.98)'}}>
                  <tr>
                    <th>الصف</th><th>كود المادة</th><th>القاعات</th><th>التاريخ والوقت</th><th>الحالة</th><th>الملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map(r=>{
                    const bg=r.status==='invalid'?'rgba(239,68,68,.07)':r.status==='warning'?'rgba(245,158,11,.07)':r.status==='conflict'?'rgba(249,115,22,.07)':'transparent';
                    return(
                      <tr key={r.id} style={{background:bg}}>
                        <td>{r.row_number}</td>
                        <td style={{fontFamily:'monospace',fontWeight:700,color:'var(--primary)'}}>{r.course_code}</td>
                        <td>{JSON.parse(r.rooms||'[]').join('، ')}</td>
                        <td>{r.exam_date||r.day} | {r.start_time}-{r.end_time}</td>
                        <td>
                          {r.status==='valid'&&<span className="badge badge-success">جاهز</span>}
                          {r.status==='warning'&&<span className="badge badge-warning">تحذير</span>}
                          {r.status==='conflict'&&<span className="badge badge-warning">تعارض</span>}
                          {r.status==='invalid'&&<span className="badge badge-danger">خطأ</span>}
                        </td>
                        <td style={{fontSize:'.75rem',maxWidth:180,color:r.status==='invalid'?'var(--danger)':'var(--warning)'}}>{JSON.parse(r.errors||r.warnings||'[]').join('، ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button className="btn btn-success" onClick={handleConfirm} disabled={confirming||(previewData.valid+previewData.warning+previewData.conflict)===0}>
                {confirming?'جاري الاستيراد...':`✅ تأكيد استيراد (${previewData.valid+previewData.warning+previewData.conflict}) صف`}
              </button>
              <button className="btn btn-secondary" onClick={handleCancelPreview} disabled={confirming}>إلغاء</button>
            </div>
          </div>
        )}
      </div>

      {/* IMPORT HISTORY */}
      <div className="table-container">
        <div className="table-header">
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:'1.1rem'}}>📂</span>
            <h3 style={{margin:0,fontSize:'1rem',fontWeight:700}}>سجل الاستيراد</h3>
          </div>
          <span className="badge badge-gray">{imports.length} عمليات</span>
        </div>
        {loading?<div className="spinner"></div>:imports.length===0?(
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <h3>لا توجد عمليات استيراد سابقة</h3>
          </div>
        ):(
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th style={{textAlign:'right'}}>اسم الملف</th>
                <th>الفترة</th>
                <th style={{textAlign:'center'}}>الصفوف</th>
                <th style={{textAlign:'center'}}>الحالة</th>
                <th>تاريخ الاستيراد</th>
                <th style={{textAlign:'center'}}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {imports.map(im=>(
                <tr key={im.id}>
                  <td style={{color:'var(--text-muted)',fontSize:'.82rem'}}>{im.id}</td>
                  <td style={{fontWeight:600}}>{im.original_filename}</td>
                  <td style={{fontSize:'.85rem',color:'var(--text-secondary)'}}>{im.academic_year} · {im.semester} · {im.exam_period}</td>
                  <td style={{textAlign:'center'}}><span className="badge badge-info">{im.imported_rows||0}/{im.total_rows||0}</span></td>
                  <td style={{textAlign:'center'}}><span className={`badge ${im.status==='imported'?'badge-success':'badge-warning'}`}>{im.status==='imported'?'مكتمل':'معاينة'}</span></td>
                  <td style={{fontSize:'.8rem',color:'var(--text-muted)'}}>{formatDateTime(im.created_at)}</td>
                  <td style={{textAlign:'center'}}><button className="btn btn-danger btn-sm" onClick={()=>handleDelete(im.id)}>🗑️</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
