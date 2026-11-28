import React,{useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {CalendarDays,ChevronLeft,ChevronRight,Download,RefreshCw,ShieldCheck} from 'lucide-react';
import {Badge,Card,Empty,MotionPage,PageAlert,Title} from '../components/UI.jsx';
import {useSession} from '../state/SessionProvider.jsx';
import {manilaClock,timeLabel} from '../lib/schedule.js';
import {getDateSessions,getMonthSessions,shiftCalendarMonth,sessionRegisterRows,
  summarizeRegister,previewOfficialRoster,summarizeCalendarMonth,exportRegisterCsv,REGISTER_STATUSES,validCalendarDate} from '../lib/attendance-calendar.js';
import {loadMonthSessionReviews,loadSessionRegister,prepareHistoricalRegister,
  correctAttendanceStatus,finalizeAttendanceSession,cancelAttendanceSession} from '../lib/attendance-calendar-api.js';
import '../styles/attendance-calendar.css';

const WEEK=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const dateLabel=(value)=>new Date(value+'T12:00:00Z').toLocaleDateString('en-PH',{
  timeZone:'UTC',weekday:'long',month:'long',day:'numeric',year:'numeric'
});
const monthLabel=month=>new Date(month+'-01T12:00:00Z').toLocaleDateString('en-PH',{
  timeZone:'UTC',month:'long',year:'numeric'
});
function fileDownload(name,content){
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const statusTone=value=>value==='Present'?'good':value==='Late'?'warn':value==='Absent'?'bad':'muted';

export function AttendanceCalendarPage(){
  const {data,refreshData,refreshing,context}=useSession();
  const today=manilaClock().date;
  const [date,setDate]=useState(today);
  const [month,setMonth]=useState(today.slice(0,7));
  const [selectedKey,setSelectedKey]=useState('');
  const [reviews,setReviews]=useState({});
  const [installed,setInstalled]=useState(null);
  const [register,setRegister]=useState({review:null,entries:[]});
  const [fetching,setFetching]=useState(false);
  const [loadingRegister,setLoadingRegister]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [editing,setEditing]=useState('');
  const [correctedStatus,setCorrectedStatus]=useState('Present');
  const [correctionReason,setCorrectionReason]=useState('');
  const [finalReason,setFinalReason]=useState('');
  const [markAbsent,setMarkAbsent]=useState(false);
  const [cancelReason,setCancelReason]=useState('');

  useEffect(()=>{
    let cancelled=false;
    setFetching(true);
    loadMonthSessionReviews(data.windows,month).then(result=>{
      if(cancelled)return;
      setInstalled(result.installed);setReviews(result.reviews);setError('');
    }).catch(e=>{if(!cancelled){setInstalled(false);setError(e.message||'Unable to read attendance calendar');}})
      .finally(()=>{if(!cancelled)setFetching(false);});
    return()=>{cancelled=true;};
  },[data.windows,month]);
  const byDate=useMemo(()=>getMonthSessions(data,month,reviews),[data,month,reviews]);
  const days=useMemo(()=>byDate.map(d=>({...d,day:Number(d.date.slice(-2))})),[byDate]);
  const offset=days.length?((new Date(days[0].date+'T12:00:00Z').getUTCDay()+6)%7):0;
  const daily=useMemo(()=>getDateSessions(data,date,reviews),[data,date,reviews]);
  const current=daily.find(x=>x.key===selectedKey)||daily[0]||null;
  const currentWindow=current?.windowId??null;

  useEffect(()=>{
    let cancelled=false;
    setRegister({review:null,entries:[]});setEditing('');
    if(!currentWindow || !installed){setLoadingRegister(false);return()=>{cancelled=true;};}
    setLoadingRegister(true);
    loadSessionRegister(currentWindow).then(r=>{if(!cancelled)setRegister(r);})
      .catch(e=>{if(!cancelled)setError(e.message||'Unable to read attendance roster');})
      .finally(()=>{if(!cancelled)setLoadingRegister(false);});
    return()=>{cancelled=true;};
  },[currentWindow,installed,data]);
  const entries=useMemo(()=>
    sessionRegisterRows(register.entries,data.attendance,data.profiles,currentWindow),
    [register.entries,data.attendance,data.profiles,currentWindow]);
  const counts=useMemo(()=>summarizeRegister(entries),[entries]);
  const monthSummary=useMemo(()=>summarizeCalendarMonth(byDate),[byDate]);
  const previewRows=useMemo(()=>current?previewOfficialRoster(data,current.sectionId,currentWindow):[],[data,current,currentWindow]);

  function selectDate(next){
    if(!validCalendarDate(next))return;
    setDate(next);setMonth(next.slice(0,7));setSelectedKey('');
    setNotice('');setEditing('');
  }
  function changeMonth(next){
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(next)))return;
    setMonth(next);
    setDate(next+'-01');setSelectedKey('');setEditing('');setNotice('');
  }
  async function mutate(callback,success){
    if(busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const result=await callback();
      await refreshData();
      const latest=await loadMonthSessionReviews(data.windows,month);
      setInstalled(latest.installed);setReviews(latest.reviews);
      if(currentWindow) setRegister(await loadSessionRegister(currentWindow));
      setEditing('');setCorrectionReason('');setFinalReason('');setCancelReason('');
      setNotice(typeof success==='function'?success(result):success);
    }catch(e){setError(e.message||'The attendance change could not be saved');}
    finally{setBusy(false);}
  }
  if(!context?.admin)return null;
  return <MotionPage>
    <Title eyebrow="ATTENDANCE MANAGEMENT"
      description="Choose a Philippine calendar date, open its class register, and review the actual student attendance records."
      actions={<button type="button" className="btn subtle" disabled={refreshing||busy}
        onClick={()=>refreshData()}><RefreshCw size={16}/> Refresh</button>}>
      Attendance calendar
    </Title>
    <PageAlert message={error} onClose={()=>setError('')}/>
    {notice&&<p className="attendance-v3-success" role="status">{notice}</p>}
    {installed===false&&<Card>
      <h2>Attendance register database update required</h2>
      <p>Install the reviewed migration <code>202611280008_attendance_calendar_register.sql</code> in Supabase after backing up your database and validating it in staging. Your existing attendance records have not been deleted.</p>
    </Card>}
    <div className="attendance-v3-main">
      <Card className="attendance-v3-calendar-card">
        <div className="attendance-v3-heading">
          <div><span className="attendance-v3-eyebrow">MONTHLY OVERVIEW</span><h2>{monthLabel(month)}</h2></div>
          <div className="attendance-v3-navigation">
            <button type="button" aria-label="Previous month" onClick={()=>changeMonth(shiftCalendarMonth(month,-1))}><ChevronLeft size={19}/></button>
            <input aria-label="Choose calendar month" type="month" min="2020-01" max="2099-12" value={month} onChange={e=>changeMonth(e.target.value)}/>
            <button type="button" aria-label="Next month" onClick={()=>changeMonth(shiftCalendarMonth(month,1))}><ChevronRight size={19}/></button>
          </div>
        </div>
        <div className="attendance-v3-legend"><span>Scheduled</span><span>Opened</span><span>Finalized</span><span>Cancelled</span></div>
        <div className="attendance-v3-month-counts"><span>{monthSummary.scheduled} meeting slots</span><span>{monthSummary.opened} opened</span><span>{monthSummary.finalized} finalized</span><span>{monthSummary.cancelled} cancelled</span></div>
        <div className="attendance-v3-grid" role="group" aria-label="Choose attendance date">
          {WEEK.map(w=><span className="attendance-v3-week" key={w}>{w}</span>)}
          {Array.from({length:offset},(_,i)=><span aria-hidden="true" key={'padding-'+i}/>)}
          {days.map(day=>{
            const opened=day.sessions.filter(s=>s.windowId).length;
            const finalized=day.sessions.filter(s=>s.status==='Finalized').length;
            const cancelled=day.sessions.filter(s=>s.status==='Cancelled').length;
            return <button type="button" key={day.date} aria-pressed={date===day.date}
              aria-label={`${day.date}: ${day.sessions.length} scheduled or recorded meetings`}
              className={`attendance-v3-day ${date===day.date?'selected':''} ${day.date===today?'today':''}`}
              onClick={()=>selectDate(day.date)}>
              <strong>{day.day}</strong>
              {day.sessions.length>0&&<small>{day.sessions.length} class{day.sessions.length===1?'':'es'}</small>}
              <div className="attendance-v3-dots" aria-hidden="true">
                {day.sessions.length>0&&<i className="scheduled"/>}
                {opened>0&&<i className="opened"/>}
                {finalized>0&&<i className="finalized"/>}
                {cancelled>0&&<i className="cancelled"/>}
              </div>
            </button>;
          })}
        </div>
        <p className="attendance-v3-explainer">Scheduled dates are not automatically counted as absences. Only an instructor-created attendance window produces an official register.</p>
      </Card>
      <Card className="attendance-v3-day-card">
        <span className="attendance-v3-eyebrow">SELECTED DAY</span>
        <h2>{dateLabel(date)}</h2>
        <div className="attendance-v3-day-summary">
          <div><strong>{daily.length}</strong><small>Scheduled / recorded</small></div>
          <div><strong>{daily.filter(s=>s.windowId).length}</strong><small>Opened sessions</small></div>
          <div><strong>{daily.filter(s=>s.status==='Finalized').length}</strong><small>Finalized</small></div>
        </div>
        <div className="attendance-v3-meetings">
          {daily.map(session=><button type="button" key={session.key}
            className={`attendance-v3-meeting ${current?.key===session.key?'selected':''}`}
            aria-pressed={current?.key===session.key}
            onClick={()=>{setSelectedKey(session.key);setEditing('');setNotice('');}}>
            <span className="attendance-v3-meeting-time">{timeLabel(session.start)} – {timeLabel(session.end)}</span>
            <strong>{session.section} · {session.subject}</strong>
            <small>{session.status}</small>
          </button>)}
          {!daily.length&&<Empty>No class meetings are scheduled or recorded for this date.</Empty>}
        </div>
        <Link className="attendance-v3-class-link" to="/admin/classes">Manage scheduled / Force Open attendance</Link>
      </Card>
    </div>

    <Card className="attendance-v3-register">
      <div className="attendance-v3-register-heading">
        <div><span className="attendance-v3-eyebrow">CLASS REGISTER</span>
          <h2>{current?`${current.section} · ${current.subject}`:'Choose a class meeting'}</h2>
          <p>{current?dateLabel(date)+' · '+current.status:'Select a date and a class above.'}</p>
        </div>
        {currentWindow&&register.review&&<button type="button" className="btn subtle" disabled={!entries.length}
          onClick={()=>fileDownload(
            `studentmonitor-attendance-${date}-${current.section}-${current.subject.replace(/\s+/g,'-')}.csv`,
            exportRegisterCsv(entries,{date,section:current.section,subject:current.subject,sessionStatus:register.review.status})
          )}><Download size={16}/> Export CSV</button>}
      </div>
      {current&&!currentWindow&&<div className="attendance-v3-blank">
        <ShieldCheck size={21}/>
        <div><strong>No attendance session opened for this meeting.</strong>
          <p>Students are Not Yet Recorded, not absent. Use Classes to open attendance during its scheduled time or Force Open today's class.</p></div>
      </div>}
      {current&&(!currentWindow||(installed&&!loadingRegister&&!register.review))&&<>
        <p className="attendance-v3-explainer">Current official section roster preview · {previewRows.length} students. For historical dates, this is not a verified past enrollment snapshot.</p>
        <div className="attendance-v3-table-scroll attendance-v3-preview-scroll"><table className="attendance-v3-table">
          <thead><tr><th>No.</th><th>Student number</th><th>Official full name</th><th>Attendance</th></tr></thead>
          <tbody>{previewRows.map((student,i)=><tr key={student.student_number}>
            <td>{i+1}</td><td className="attendance-v3-number">{student.student_number}</td>
            <td>{student.student_name_snapshot}</td>
            <td><Badge tone={statusTone(student.status)}>{student.status}</Badge></td>
          </tr>)}</tbody>
        </table></div>
        {!previewRows.length&&<Empty>There are no active official roster students for this section. Check your private roster import.</Empty>}
      </>}
      {currentWindow&&!installed&&<p className="attendance-v3-explainer">The calendar can show this existing window, but corrections and finalization require migration 008.</p>}
      {currentWindow&&installed&&loadingRegister&&<p role="status" className="attendance-v3-explainer">Loading official attendance register…</p>}
      {currentWindow&&installed&&!loadingRegister&&!register.review&&<>
        <div className="attendance-v3-blank"><ShieldCheck size={21}/><div>
          <strong>Older attendance session — no captured roster</strong>
          <p>This session predates Phase 3. Its original check-ins remain saved, but its historical class membership is not verified. Preparing the register copies today's roster; it does not reconstruct the original enrollment.</p>
        </div></div>
        <button type="button" className="btn outline" disabled={busy} onClick={()=>{
          if(window.confirm('Prepare this historical register using the CURRENT official class list? Original attendance check-ins will not be changed.'))
            mutate(()=>prepareHistoricalRegister(currentWindow),'Historical register prepared using the current class list. Review membership before finalizing.');
        }}>Prepare historical register</button>
      </>}
      {currentWindow&&installed&&!loadingRegister&&register.review&&<>
        {register.review.status==='Cancelled'&&<p className="attendance-v3-notice">This attendance session was cancelled; its check-in history is preserved but it must not count toward official attendance grades.</p>}
        {register.review.status==='Finalized'&&<p className="attendance-v3-notice">Finalized {register.review.finalized_at?new Date(register.review.finalized_at).toLocaleString('en-PH'):'by an instructor'}. Corrections remain possible with a documented reason.</p>}
        <div className="attendance-v3-stats">
          {['total','Present','Late','Absent','Excused','Not Yet Recorded'].map(k=><div key={k}>
            <strong>{counts[k]}</strong><small>{k==='total'?'Students':k}</small>
          </div>)}
        </div>
        <div className="attendance-v3-table-scroll"><table className="attendance-v3-table">
          <thead><tr><th>No.</th><th>Student no.</th><th>Official name (captured)</th><th>Status</th><th>Remarks</th><th>Correction</th></tr></thead>
          <tbody>{entries.map((item,i)=><tr key={item.student_number}>
            <td>{i+1}</td><td className="attendance-v3-number">{item.student_number}</td>
            <td><strong>{item.student_name_snapshot}</strong></td>
            <td><Badge tone={statusTone(item.status)}>{item.status}</Badge></td>
            <td>{item.remarks||'—'}</td>
            <td><button type="button" className="attendance-v3-link" disabled={busy||register.review.status==='Cancelled'}
              onClick={()=>{setEditing(item.student_number);setCorrectedStatus(item.status);setCorrectionReason('');}}>Correct</button></td>
          </tr>)}</tbody>
        </table></div>
        {!entries.length&&<Empty>No official students were captured when this attendance window opened. Check that the roster had already been imported; do not finalize an empty register.</Empty>}
        {editing&&<form className="attendance-v3-correction" onSubmit={e=>{
          e.preventDefault();
          if(window.confirm('Save this instructor attendance correction? It will be audited.'))
            mutate(()=>correctAttendanceStatus(currentWindow,editing,correctedStatus,correctionReason),'Attendance correction saved.');
        }}>
          <h3>Correct attendance · {entries.find(e=>e.student_number===editing)?.student_name_snapshot}</h3>
          <label>Status<select value={correctedStatus} onChange={e=>setCorrectedStatus(e.target.value)}>
            {REGISTER_STATUSES.map(status=><option key={status}>{status}</option>)}
          </select></label>
          <label>Reason<input required minLength={8} maxLength={500} value={correctionReason} onChange={e=>setCorrectionReason(e.target.value)} placeholder="Reason for correction"/></label>
          <button type="submit" className="btn primary" disabled={busy||correctionReason.trim().length<8}>Save correction</button>
          <button type="button" className="btn subtle" onClick={()=>setEditing('')}>Cancel</button>
        </form>}
        {register.review.status==='Draft'&&<div className="attendance-v3-finalization">
          <div><h3>Finalize this attendance session</h3>
            <p>Only a closed/expired session can be finalized. Marking students absent is optional and must be explicitly authorized.</p></div>
          <label className="attendance-v3-check"><input type="checkbox" checked={markAbsent} onChange={e=>setMarkAbsent(e.target.checked)}/>
            Convert unrecorded students without check-ins to Absent</label>
          <label>Finalization reason<input value={finalReason} onChange={e=>setFinalReason(e.target.value)}
            minLength={8} maxLength={500} placeholder="Reason / classroom record reference"/></label>
          <button type="button" className="btn primary" disabled={busy||finalReason.trim().length<8||!entries.length||current.active}
            onClick={()=>{
              if(window.confirm(markAbsent?'Finalize and mark unrecorded students absent?':'Finalize and leave missing statuses Not Yet Recorded?'))
                mutate(()=>finalizeAttendanceSession(currentWindow,markAbsent,finalReason),
                  count=>`Session finalized. ${count} students marked absent.`);
            }}>Finalize session</button>
          <div className="attendance-v3-cancel-area">
            <h3>Cancel session</h3>
            <label>Cancellation reason<input minLength={8} maxLength={500} value={cancelReason}
              onChange={e=>setCancelReason(e.target.value)} placeholder="Reason for cancellation"/></label>
            <button type="button" className="btn outline" disabled={busy||cancelReason.trim().length<8}
              onClick={()=>{
                if(window.confirm('Cancel this attendance session? Existing check-ins will be retained, but this session will be excluded from official reporting.'))
                  mutate(()=>cancelAttendanceSession(currentWindow,cancelReason),'Attendance session cancelled; records retained.');
              }}>Cancel attendance session</button>
          </div>
        </div>}
        <p className="attendance-v3-explainer">The captured register preserves student names for this window. Corrections are stored separately from original check-in receipts; every change is recorded in the audit log. Only Finalized, non-cancelled sessions should feed future attendance grades.</p>
      </>}
    </Card>
  </MotionPage>;
}
