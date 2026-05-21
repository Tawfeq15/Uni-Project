import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { scheduleAPI, examsAPI, roomsAPI } from '../api';
import { useToast } from '../components/Toast';

const DAY_AR = { sunday:'الأحد',monday:'الاثنين',tuesday:'الثلاثاء',wednesday:'الأربعاء',thursday:'الخميس',friday:'الجمعة',saturday:'السبت' };
const FACULTY_OPTIONS = [
  { value:'',label:'الكل' },
  { value:'it_library',label:'الكل (IT + المكتبة)' },
  { value:'it',label:'مختبرات IT' },
  { value:'library',label:'مختبرات المكتبة' },
  { value:'media',label:'مختبرات الإعلام' },
  { value:'arts',label:'مختبرات الآداب' },
];

export default function FinalSchedule() {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ faculty:'',day:'',date_from:'',date_to:'',course_code:'',course_name:'',room:'',lecturer:'',source_type:'',include_cancelled:false });
  const [lecturers, setLecturers] = useState([]);
  const toast = useToast();
  const [actionModal, setActionModal] = useState({ isOpen:false,type:null,exam:null });
  const [actionData, setActionData] = useState({});
  const [actionLoading, setActionLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [roomCombos, setRoomCombos] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [selectedRooms, setSelectedRooms] = useState([]);
  const [roomWarnings, setRoomWarnings] = useState([]);
  const [conflictDetails, setConflictDetails] = useState([]);

  useEffect(() => { examsAPI.getLecturers().then(d => setLecturers(d.lecturers||[])).catch(()=>{}); },[]);
  useEffect(() => { load(); },[filter]);

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if(filter.faculty) params.faculty=filter.faculty;
      if(filter.day) params.day=filter.day;
      if(filter.date_from) params.date_from=filter.date_from;
      if(filter.date_to) params.date_to=filter.date_to;
      if(filter.course_code) params.course_code=filter.course_code;
      if(filter.course_name) params.course_name=filter.course_name;
      if(filter.room) params.room=filter.room;
      if(filter.lecturer) params.lecturer=filter.lecturer;
      if(filter.source_type) params.source_type=filter.source_type;
      const data = await scheduleAPI.list(params);
      let list = data.exams||[];
      if(!filter.include_cancelled) list=list.filter(e=>e.status!=='cancelled'&&e.status!=='replaced');
      setExams(list);
    } catch(e) { toast(e.message,'error'); } finally { setLoading(false); }
  }

  function openAction(type,exam) {
    setActionModal({isOpen:true,type,exam});
    setConflictDetails([]);setAvailableRooms([]);setRoomCombos([]);setSelectedRooms([]);setRoomWarnings([]);
    if(type==='edit') setActionData({exam_date:exam.exam_date||'',start_time:exam.start_time?exam.start_time.substring(0,5):'',end_time:exam.end_time?exam.end_time.substring(0,5):'',instructor_name:exam.lecturer||'',student_count:exam.student_count||0,notes:exam.notes||'',status:exam.status||'scheduled',faculty:exam.faculty||'',capacity:exam.total_capacity||'',rooms:exam.rooms?exam.rooms.join('-'):''});
    else if(type==='reschedule') { setActionData({exam_date:exam.exam_date||'',start_time:exam.start_time?exam.start_time.substring(0,5):'',end_time:exam.end_time?exam.end_time.substring(0,5):'',rooms:exam.rooms?exam.rooms.join('-'):'',reason:''}); setSelectedRooms(exam.rooms||[]); }
    else if(type==='cancel') setActionData({reason:''});
    else if(type==='audit') { setAuditLogs([]); setActionLoading(true); examsAPI.getAudit(exam.id).then(r=>setAuditLogs(r.audit||[])).catch(err=>toast(err.message,'error')).finally(()=>setActionLoading(false)); }
  }

  function closeAction() { setActionModal({isOpen:false,type:null,exam:null}); setActionData({}); setConflictDetails([]); }

  async function fetchAvailableRooms() {
    const {exam}=actionModal;
    if(!actionData.exam_date||!actionData.start_time||!actionData.end_time) return;
    setRoomsLoading(true);
    try {
      const res=await roomsAPI.available({exam_date:actionData.exam_date,start_time:actionData.start_time,end_time:actionData.end_time,capacity_required:exam?.student_count||0,exclude_exam_id:exam?.id,course_code:exam?.course_code});
      setAvailableRooms(res.available_rooms||[]);setRoomCombos(res.recommended_combinations||[]);setRoomWarnings(res.warnings||[]);
    } catch(e){toast(e.message,'error');} finally{setRoomsLoading(false);}
  }

  function toggleRoom(r) { setSelectedRooms(prev=>prev.includes(r)?prev.filter(x=>x!==r):[...prev,r]); }
  function applyCombo(combo) { setSelectedRooms(combo.rooms); }

  async function handleActionSubmit(e) {
    e.preventDefault(); setActionLoading(true); setConflictDetails([]);
    const {type,exam}=actionModal;
    try {
      if(type==='edit') {
        const payload={exam_date:actionData.exam_date||exam.exam_date,start_time:actionData.start_time||exam.start_time,end_time:actionData.end_time||exam.end_time,rooms:actionData.rooms?actionData.rooms.split('-').map(r=>r.trim()).filter(Boolean):(exam.rooms||[]),instructor_name:actionData.instructor_name,student_count:parseInt(actionData.student_count)||0,notes:actionData.notes,status:actionData.status,faculty:actionData.faculty,is_full_day:exam.is_full_day};
        const res=await examsAPI.updateScheduled(exam.id,payload);
        if(res.data){const updated={...res.data,rooms:JSON.parse(res.data.rooms_json||'[]')};setExams(prev=>prev.map(ex=>ex.id===exam.id?{...ex,...updated}:ex));}
        toast('تم تحديث الامتحان بنجاح','success'); closeAction();
      } else if(type==='reschedule') {
        if(!actionData.reason?.trim()) throw new Error('يجب تحديد سبب إعادة الجدولة');
        const rooms=selectedRooms.length>0?selectedRooms:(actionData.rooms?actionData.rooms.split('-').map(r=>r.trim()).filter(Boolean):[]);
        if(rooms.length===0) throw new Error('يجب تحديد قاعة واحدة على الأقل');
        const res=await examsAPI.rescheduleScheduled(exam.id,{exam_date:actionData.exam_date,start_time:actionData.start_time,end_time:actionData.end_time,rooms,reason:actionData.reason});
        if(res.data){const updated={...res.data,rooms:JSON.parse(res.data.rooms_json||'[]')};setExams(prev=>prev.map(ex=>ex.id===exam.id?{...ex,...updated}:ex));}
        toast('تمت إعادة جدولة الامتحان بنجاح','success'); closeAction();
      }
    } catch(err) {
      if(err.conflicts){setConflictDetails(err.conflicts);toast('لا يمكن الحفظ بسبب تعارض في القاعة','error');}
      else toast(err.message,'error');
    } finally { setActionLoading(false); }
  }

  async function handleDeleteExam(exam) {
    if(!confirm('هل أنت متأكد من إلغاء هذا الاختبار؟')) return;
    const reason=prompt('أدخل سبب الإلغاء (مطلوب):');
    if(!reason) return toast('يجب إدخال سبب الإلغاء','warning');
    try { await examsAPI.cancelScheduled(exam.id,reason); setExams(prev=>prev.map(ex=>ex.id===exam.id?{...ex,status:'cancelled'}:ex)); toast('تم إلغاء الامتحان بنجاح','success'); } catch(e){toast(e.message,'error');}
  }

  async function clearSchedule() {
    if(!confirm('⚠️ سيتم حذف كافة الاختبارات المجدولة! هل أنت متأكد؟')) return;
    try { const res=await scheduleAPI.clear(); toast(res.message,'success'); load(); } catch(e){toast(e.message,'error');}
  }

  function formatDisplayDate(d) {
    if(!d||!d.includes('-')) return d;
    const[y,m,day]=d.split('-'); return day+'-'+m+'-'+y;
  }

  const getSourceBadge=s=>{
    switch(s){
      case 'import': return <span className="badge badge-info" style={{fontSize:'.65rem'}}>استيراد</span>;
      case 'rescheduled': return <span className="badge badge-warning" style={{fontSize:'.65rem'}}>معاد جدولته</span>;
      case 'conflict_approval': return <span className="badge badge-primary" style={{fontSize:'.65rem'}}>موافق عليه</span>;
      default: return <span className="badge badge-gray" style={{fontSize:'.65rem'}}>يدوي</span>;
    }
  };

  const getStatusBadge=s=>{
    switch(s){
      case 'cancelled': return <span className="badge badge-danger">ملغي</span>;
      case 'replaced': return <span className="badge badge-warning">مستبدل</span>;
      default: return null;
    }
  };

  // Merge rows with same course_code + exam_date + start_time by summing student_count
  const mergedExams = Object.values(
    exams.reduce((acc, exam) => {
      const key = `${exam.course_code||''}__${exam.exam_date||''}__${exam.start_time||''}__${exam.end_time||''}`;
      if (acc[key]) {
        acc[key] = { ...acc[key], student_count: (acc[key].student_count||0) + (exam.student_count||0) };
      } else {
        acc[key] = { ...exam };
      }
      return acc;
    }, {})
  );

  const grouped={};
  for(const exam of mergedExams){const k=exam.exam_date||'تاريخ غير محدد';if(!grouped[k])grouped[k]=[];grouped[k].push(exam);}
  const orderedGroups=Object.keys(grouped).sort((a,b)=>{
    const ia=a.includes('-')&&!a.includes('تاريخ'),ib=b.includes('-')&&!b.includes('تاريخ');
    if(ia&&ib) return new Date(a)-new Date(b);if(ia)return -1;if(ib)return 1;return a.localeCompare(b);
  });

  return (
    <div className="page" animate-fade-in>
      {/* ===== PAGE HEADER ===== */}
      <div className="page-header">
        <div>
          <h1 className="page-title">🗓️ الجدول النهائي للاختبارات</h1>
          <p className="page-subtitle">إدارة ومراقبة كافة الاختبارات المعتمدة في النظام</p>
        </div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}} className="no-print">
          <button className="btn btn-danger" onClick={clearSchedule} style={{gap:8}}>
            🗑️ تفريغ النظام
          </button>
          <button className="btn btn-pdf" onClick={()=>window.print()} style={{gap:8}}>
            🖨️ طباعة
          </button>
          <button className="btn btn-excel" onClick={()=>scheduleAPI.exportExcel({...filter})} style={{gap:8}}>
            📥 تصدير Excel
          </button>
          <button className="btn btn-secondary" onClick={()=>scheduleAPI.exportPdf({...filter})} style={{gap:8}}>
            📄 PDF
          </button>
          <button className="btn btn-secondary btn-icon" onClick={load} title="تحديث">🔄</button>
        </div>
      </div>

      {/* ===== FILTER BAR ===== */}
      <div className="filter-bar no-print" style={{position:'sticky',top:0,zIndex:100,backdropFilter:'blur(12px)',background:'var(--bg-surface)',borderBottom:'1px solid var(--border)',marginBottom:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
          <span style={{fontSize:'1.1rem'}}>🔍</span>
          <h3 style={{fontSize:'.95rem',margin:0,color:'var(--text-primary)'}}>تصفية وبحث</h3>
          <span className="badge badge-primary" style={{marginRight:'auto'}}>{exams.length} نتيجة</span>
        </div>
        <div className="form-row">
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">الكلية / المبنى</label>
            <select className="form-control" value={filter.faculty} onChange={e=>setFilter(f=>({...f,faculty:e.target.value}))}>
              {FACULTY_OPTIONS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">الفترة من</label>
            <input type="date" className="form-control" value={filter.date_from} onChange={e=>setFilter(f=>({...f,date_from:e.target.value}))} />
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">الفترة إلى</label>
            <input type="date" className="form-control" value={filter.date_to} onChange={e=>setFilter(f=>({...f,date_to:e.target.value}))} />
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">المصدر</label>
            <select className="form-control" value={filter.source_type} onChange={e=>setFilter(f=>({...f,source_type:e.target.value}))}>
              <option value="">الكل</option>
 <option value="import">استيراد من ملف</option>
 <option value="manual">إدخال يدوي</option>
 <option value="rescheduled">إعادة جدولة</option>
 </select>
 </div>
 <div className="form-group" style={{marginBottom:0}}>
 <label className="form-label">اسم المادة / الرمز</label>
 <input type="text" className="form-control" placeholder="بحث..." value={filter.course_name} onChange={e=>setFilter(f=>({...f,course_name:e.target.value}))} />
 </div>
 <div className="form-group" style={{marginBottom:0}}>
 <label className="form-label">المحاضر</label>
 <input type="text" className="form-control" list="lecturers-datalist" placeholder="بحث..." value={filter.lecturer} onChange={e=>setFilter(f=>({...f,lecturer:e.target.value}))} />
 <datalist id="lecturers-datalist">{lecturers.map((l,i)=><option key={i} value={l}/>)}</datalist>
 </div>
 <div className="form-group" style={{marginBottom:0,display:'flex',alignItems:'flex-end',gap:12}}>
 <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:'.88rem',color:'var(--text-secondary)'}}>
 <input type="checkbox" checked={filter.include_cancelled} onChange={e=>setFilter(f=>({...f,include_cancelled:e.target.checked}))} />
 إظهار الملغى
 </label>
 <button className="btn btn-secondary" btn-sm onClick={()=>setFilter({faculty:'',day:'',date_from:'',date_to:'',course_code:'',course_name:'',room:'',lecturer:'',source_type:'',include_cancelled:false})}>
 ✕ مسح
 </button>
 </div>
 </div>
 </div>

      {/* ===== TABLE ===== */}
      {loading ? (
        <div className="spinner"></div>
      ) : exams.length===0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon">🗓️</div>
          <h3>لا توجد اختبارات ضمن الفلتر الحالي</h3>
          <p>قم بتعديل الفلتر أو استيراد جدول جديد.</p>
        </div>
      ) : (
        <div className="table-container">
          <div className="table-header">
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <span style={{fontSize:'1.1rem'}}>📋</span>
              <h3 style={{margin:0,fontSize:'1rem',fontWeight:700}}>سجل الاختبارات المعتمدة</h3>
            </div>
            <span className="badge badge-primary">{exams.length} اختبار</span>
          </div>
          <div style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - 320px)'}}>
            <table style={{minWidth:1600}}>
              <thead style={{position:'sticky',top:0,zIndex:20}}>
                <tr>
                  <th style={{width:170,background:'rgba(11,16,32,0.98)',backdropFilter:'blur(12px)'}}>اليوم والتاريخ</th>
                  <th style={{width:150,background:'rgba(11,16,32,0.98)'}}>الوقت</th>
                  <th style={{width:130,background:'rgba(11,16,32,0.98)'}}>رقم المادة</th>
                  <th style={{width:80,background:'rgba(11,16,32,0.98)'}}>ش</th>
                  <th style={{width:220,textAlign:'right',background:'rgba(11,16,32,0.98)'}}>اسم المادة</th>
                  <th style={{width:260,textAlign:'right',background:'rgba(11,16,32,0.98)'}}>المحاضر</th>
                  <th style={{width:260,textAlign:'center',background:'rgba(11,16,32,0.98)'}}>القاعات</th>
                  <th style={{width:140,textAlign:'center',background:'rgba(11,16,32,0.98)'}}>الطلبة / السعة</th>
                  <th style={{width:120,textAlign:'center',background:'rgba(11,16,32,0.98)'}}>الحالة</th>
                  <th className="no-print" style={{width:110,textAlign:'center',background:'rgba(11,16,32,0.98)'}}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {orderedGroups.map(groupKey=>{
                  const dayExams=grouped[groupKey].sort((a,b)=>{
                    if(a.is_full_day)return -1;if(b.is_full_day)return 1;
                    return (a.start_time||'').localeCompare(b.start_time||'');
                  });
                  return dayExams.map((exam,i)=>{
                    const isFirst=i===0;
                    if(exam.is_full_day) return (
                      <tr key={exam.id} style={{background:'rgba(14,165,233,0.08)'}}>
                        <td colSpan={10} style={{padding:'10px 16px',textAlign:'right',fontWeight:'bold',color:'var(--accent)'}}>
                          {isFirst&&('🗓️ '+formatDisplayDate(d)+' | '+t+' : ')}
                          {exam.course_name||'حدث كامل اليوم'}
                        </td>
                      </tr>
                    );
                    const isCancelled=['cancelled','replaced'].includes(exam.status);
                    const rowBg=isCancelled?'rgba(239,68,68,0.06)':(exam.source_type==='rescheduled'?'rgba(245,158,11,0.06)':'transparent');
                    const timeStart=exam.start_time?exam.start_time.substring(0,5):null;
                    const timeEnd=exam.end_time?exam.end_time.substring(0,5):null;
                    const timeLabel=timeStart?(timeStart+(timeEnd?' - '+timeEnd:'')):'--:--';
                    return (
                      <tr key={exam.id} style={{opacity:isCancelled?.6:1,background:rowBg}}>
                        <td style={{textAlign:'center',verticalAlign:'middle'}}>
                          {isFirst&&<div style={{color:'var(--primary)',fontWeight:700,fontSize:'.85rem',marginBottom:3}}>{DAY_AR[exam.day]||exam.day}</div>}
                          <div dir="ltr" style={{fontFamily:'monospace',fontWeight:600,fontSize:'.88rem'}}>{formatDisplayDate(exam.exam_date)}</div>
                        </td>
                        <td dir="ltr" style={{textAlign:'center',fontFamily:'monospace',fontWeight:700,fontSize:'.92rem',color:'var(--accent)'}}>{timeLabel}</td>
                        <td style={{textAlign:'center',fontWeight:700,color:'var(--primary)',fontSize:'.88rem'}}>{exam.course_code||'-'}</td>
                        <td style={{textAlign:'center',color:'var(--text-muted)',fontSize:'.85rem'}}>{exam.section||'-'}</td>
                        <td style={{fontWeight:600,maxWidth:220,whiteSpace:'normal',lineHeight:1.4}}>{exam.course_name||'-'}</td>
                        <td style={{color:'var(--text-secondary)',fontSize:'.88rem'}}>{exam.lecturer||'-'}</td>
                        <td style={{textAlign:'center'}}>
                          <div style={{display:'flex',flexWrap:'wrap',gap:5,justifyContent:'center'}}>
                            {(exam.rooms||[]).map(r=><span key={r} className="badge badge-gray" style={{fontSize:'.72rem'}}>{r}</span>)}
                          </div>
                        </td>
                        <td style={{textAlign:'center'}}>
                          <span style={{fontWeight:700,color:exam.student_count>exam.total_capacity?'var(--danger)':'var(--success)',fontSize:'.9rem'}}>{exam.student_count}</span>
                          <span style={{color:'var(--text-muted)',fontSize:'.78rem'}}> / {exam.total_capacity}</span>
                        </td>
                        <td style={{textAlign:'center'}}>
                          <div style={{display:'flex',flexDirection:'column',gap:5,alignItems:'center'}}>
                            {getSourceBadge(exam.source_type)}
                            {getStatusBadge(exam.status)}
                          </div>
                        </td>
                        <td className="no-print" style={{textAlign:'center'}}>
                          <div style={{display:'flex',gap:5,justifyContent:'center'}}>
                            {!isCancelled&&(
                              <>
                                <button className="btn btn-primary" btn-sm style={{padding:'4px 8px',fontSize:'.78rem'}} onClick={()=>navigate('/new-exam',{state:{editExam:exam}})} title="تعديل">✏️</button>
                                <button className="btn btn-danger btn-sm" style={{padding:'4px 8px',fontSize:'.78rem'}} onClick={()=>handleDeleteExam(exam)} title="إلغاء">❌</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== MODAL ===== */}
      {actionModal.isOpen&&(
        <div className="modal-overlay" onClick={closeAction}>
          <div className="modal-content" onClick={e=>e.stopPropagation()} style={{maxWidth:actionModal.type==='audit'?700:520,position:'relative'}}>
            <div className="modal-header">
              <h2 style={{fontSize:'1.05rem'}}>
                {actionModal.type==='edit'&&'✏️ تعديل بيانات الاختبار'}
                {actionModal.type==='reschedule'&&'🔄 إعادة جدولة الاختبار'}
                {actionModal.type==='cancel'&&'❌ إلغاء الاختبار'}
                {actionModal.type==='audit'&&'📋 سجل الحركات'}
              </h2>
              <button className="btn btn-secondary" btn-sm onClick={closeAction}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{padding:'12px 16px',background:'rgba(99,102,241,.06)',borderRadius:12,marginBottom:20,border:'1px solid rgba(99,102,241,.15)'}}>
                <strong style={{color:'var(--primary)'}}>{actionModal.exam.course_code}</strong> — {actionModal.exam.course_name}
                <div style={{fontSize:'.82rem',color:'var(--text-muted)',marginTop:4}}>
                  الموعد: {formatDisplayDate(actionModal.exam.exam_date)} | {actionModal.exam.start_time?.substring(0,5)}
                </div>
              </div>

              {actionModal.type==='edit'&&(
                <form id="actionForm" onSubmit={handleActionSubmit} style={{display:'flex',flexDirection:'column',gap:14}}>
                  <div className="form-row">
                    <div className="form-group"><label className="form-label">تاريخ الامتحان</label><input type="date" required className="form-control" value={actionData.exam_date} onChange={e=>setActionData({...actionData,exam_date:e.target.value})}/></div>
                    <div className="form-group"><label className="form-label">وقت البداية</label><input type="time" required className="form-control" value={actionData.start_time} onChange={e=>setActionData({...actionData,start_time:e.target.value})}/></div>
                    <div className="form-group"><label className="form-label">وقت النهاية</label><input type="time" required className="form-control" value={actionData.end_time} onChange={e=>setActionData({...actionData,end_time:e.target.value})}/></div>
                  </div>
                  <div className="form-group"><label className="form-label">القاعات (مفصولة بـ -)</label><input type="text" className="form-control" value={actionData.rooms} onChange={e=>setActionData({...actionData,rooms:e.target.value})} dir="ltr" /></div>
                  <div className="form-row">
                    <div className="form-group"><label className="form-label">المحاضر</label><input type="text" className="form-control" value={actionData.instructor_name} onChange={e=>setActionData({...actionData,instructor_name:e.target.value})}/></div>
                    <div className="form-group"><label className="form-label">عدد الطلبة</label><input type="number" className="form-control" value={actionData.student_count} onChange={e=>setActionData({...actionData,student_count:e.target.value})}/></div>
                  </div>
                  <div className="form-group"><label className="form-label">ملاحظات</label><textarea className="form-control" rows="2" value={actionData.notes} onChange={e=>setActionData({...actionData,notes:e.target.value})}></textarea></div>
                  {conflictDetails.length>0&&<div className="alert alert-danger"><strong>تعارض:</strong><ul style={{margin:'4px 0 0 16px'}}>{conflictDetails.map((c,i)=><li key={i}>{c.message}</li>)}</ul></div>}
                </form>
              )}

              {actionModal.type==='reschedule'&&(
                <form id="actionForm" onSubmit={handleActionSubmit} style={{display:'flex',flexDirection:'column',gap:14}}>
                  <div className="alert alert-warning">إعادة الجدولة ستتحقق من التعارضات الجديدة.</div>
                  <div className="form-row">
                    <div className="form-group"><label className="form-label">التاريخ الجديد</label><input type="date" required className="form-control" value={actionData.exam_date} onChange={e=>setActionData({...actionData,exam_date:e.target.value})} onBlur={fetchAvailableRooms}/></div>
                    <div className="form-group"><label className="form-label">وقت البداية</label><input type="time" required className="form-control" value={actionData.start_time} onChange={e=>setActionData({...actionData,start_time:e.target.value})} onBlur={fetchAvailableRooms}/></div>
                    <div className="form-group"><label className="form-label">وقت النهاية</label><input type="time" required className="form-control" value={actionData.end_time} onChange={e=>setActionData({...actionData,end_time:e.target.value})} onBlur={fetchAvailableRooms}/></div>
                  </div>
                  {roomCombos.length>0&&<div className="form-group"><label className="form-label">اقتراحات ({actionModal.exam.student_count} طالب):</label><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{roomCombos.map((c,i)=><button key={i} type="button" className="btn btn-sm" onClick={()=>applyCombo(c)} style={{background:selectedRooms.join(',')===c.rooms.join(',')? 'var(--primary)':'rgba(99,102,241,.1)',color:selectedRooms.join(',')===c.rooms.join(',')? '#fff':'var(--primary)',border:'1px solid var(--primary)'}}>{c.rooms.join(' + ')} <span style={{opacity:.7,fontSize:'.8em'}}>({c.total_capacity})</span></button>)}</div></div>}
                  <div className="form-group"><label className="form-label">القاعات المحددة</label><div style={{display:'flex',flexWrap:'wrap',gap:8,padding:12,background:'rgba(255,255,255,.04)',borderRadius:10,minHeight:44}}>{selectedRooms.length===0?<span style={{color:'var(--text-muted)',fontSize:'.85rem'}}>لم يتم تحديد قاعات</span>:selectedRooms.map(r=><span key={r} onClick={()=>toggleRoom(r)} className="badge badge-primary" style={{cursor:'pointer'}}>{r} ✕</span>)}</div></div>
                  {availableRooms.length>0&&<div className="form-group"><label className="form-label">قاعات متاحة:</label><div style={{display:'flex',flexWrap:'wrap',gap:6,maxHeight:110,overflowY:'auto',padding:10,border:'1px solid var(--border)',borderRadius:10}}>{availableRooms.map(r=><span key={r.room_name} onClick={()=>toggleRoom(r.room_name)} className="badge badge-gray" style={{cursor:'pointer'}}>{r.room_name} <small>({r.capacity})</small></span>)}</div></div>}
                  <div className="form-group"><label className="form-label">سبب إعادة الجدولة (مطلوب)</label><input type="text" required className="form-control" placeholder="مثال: طلب المحاضر..." value={actionData.reason} onChange={e=>setActionData({...actionData,reason:e.target.value})}/></div>
                  {conflictDetails.length>0&&<div className="alert alert-danger"><strong>تعارض:</strong><ul style={{margin:'4px 0 0 16px'}}>{conflictDetails.map((c,i)=><li key={i}>{c.message}</li>)}</ul></div>}
                </form>
              )}

              {actionModal.type==='cancel'&&(
                <form id="actionForm" onSubmit={handleActionSubmit} style={{display:'flex',flexDirection:'column',gap:14}}>
                  <div className="alert alert-danger">سيتم إزالة هذا الاختبار من الجدول وستصبح القاعات متاحة.</div>
                  <div className="form-group"><label className="form-label">سبب الإلغاء (مطلوب)</label><textarea required className="form-control" rows="3" placeholder="اذكر سبب الإلغاء..." value={actionData.reason} onChange={e=>setActionData({...actionData,reason:e.target.value})}></textarea></div>
                </form>
              )}

              {actionModal.type==='audit'&&(
                <div>
                  {actionLoading?<div className="spinner spinner-sm"></div>:auditLogs.length===0?<p style={{color:'var(--text-muted)'}}>لا يوجد سجل حركات.</p>:(
                    <div style={{maxHeight:400,overflowY:'auto'}}>
                      {auditLogs.map((log,i)=>(
                        <div key={i} style={{padding:14,borderBottom:'1px solid var(--border)',background:'rgba(255,255,255,.02)',marginBottom:8,borderRadius:10}}>
                          <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                            <span className="badge badge-gray">{log.action}</span>
                            <span style={{fontSize:'.78rem',color:'var(--text-muted)'}} dir="ltr">{new Date(log.created_at).toLocaleString()}</span>
                          </div>
                          <div style={{fontSize:'.85rem'}}><strong>المستخدم:</strong> {log.operator_name}</div>
                          {log.new_values?.reason&&<div style={{fontSize:'.85rem',marginTop:4,color:'var(--warning)'}}><strong>السبب:</strong> {log.new_values.reason}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {actionModal.type!=='audit'&&(
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeAction} disabled={actionLoading}>إلغاء</button>
                <button type="submit" form="actionForm" className="btn btn-primary" disabled={actionLoading}>
                  {actionLoading?'جاري المعالجة...':'تأكيد'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
