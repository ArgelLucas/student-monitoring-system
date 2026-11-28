import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {Card,Title,MotionPage,Badge,Empty,PageAlert} from '../components/UI.jsx';
import {useSession} from '../state/SessionProvider.jsx';
import {
  loadAcademicWorkspace,createAcademicYear,createAcademicTerm,
  createClassOffering,enrollClassStudents,updateEnrollmentStatus,
  archiveClassOffering
} from '../lib/academic-classes.js';
import {offeringTitle,enrollmentName} from '../lib/academic-classes-format.js';
import '../styles/academic-classes.css';

const isoToday=()=>new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date());
const selectedId=x=>x===''?null:Number(x);
const dateRange=(from,to)=>`${from} — ${to}`;
const DAYS=['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

export function AcademicClassesPage(){
  const {context} = useSession();
  const [workspace,setWorkspace]=useState(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [selectedTerm,setSelectedTerm]=useState('');
  const [selectedOffering,setSelectedOffering]=useState('');
  const [selectedStudents,setSelectedStudents]=useState([]);
  const [studentSearch,setStudentSearch]=useState('');
  const [year,setYear]=useState({label:'2026-2027',starts:'2026-08-01',ends:'2027-07-31'});
  const [term,setTerm]=useState({name:'1st Semester',starts:'2026-08-01',ends:'2026-12-31',year:''});
  const [offering,setOffering]=useState({section:'',subject:'',program:'',yearLevel:'',room:''});
  const [enrolledOn,setEnrolledOn]=useState(isoToday());
  const [statusReason,setStatusReason]=useState('');
  const [editingEnrollment,setEditingEnrollment]=useState('');
  const [nextStatus,setNextStatus]=useState('dropped');

  const refresh=useCallback(async({retainSelection=true}={})=>{
    if(!context?.admin)return;
    setLoading(true);
    try{
      const latest=await loadAcademicWorkspace();
      setWorkspace(latest);setError('');
      if(!retainSelection){setSelectedTerm('');setSelectedOffering('');}
    }catch(e){setError(e.message||'Unable to read academic classes');}
    finally{setLoading(false);}
  },[context?.admin]);

  useEffect(()=>{refresh();},[refresh]);
  const years=workspace?.years||[];
  const terms=workspace?.terms||[];
  const offerings=workspace?.offerings||[];
  const sections=workspace?.sections||[];
  const subjects=workspace?.subjects||[];
  const roster=workspace?.roster||[];
  const enrollments=workspace?.enrollments||[];
  const meetingRows=workspace?.meetings||[];
  const availableTerms=terms.filter(t=>t.status!=='archived');
  const activeTerm=selectedTerm||String(availableTerms[0]?.id||'');
  const matchingOfferings=offerings.filter(o=>String(o.academic_term_id)===activeTerm);
  const activeOffering=selectedOffering&&matchingOfferings.some(o=>String(o.id)===selectedOffering)
    ?selectedOffering:String(matchingOfferings[0]?.id||'');
  const currentOffering=matchingOfferings.find(o=>String(o.id)===activeOffering);
  const currentTerm=terms.find(t=>String(t.id)===activeTerm);
  const classEnrollments=enrollments.filter(e=>String(e.offering_id)===activeOffering);
  const enrolledNumbers=new Set(classEnrollments.map(e=>e.student_number));
  const eligible=useMemo(()=>{
    const query=studentSearch.trim().toLowerCase();
    return roster.filter(r=>Number(r.section_id)===Number(currentOffering?.section_id)
      && !enrolledNumbers.has(r.student_number)
      && (!query || `${r.student_number} ${r.surname} ${r.first_name}`.toLowerCase().includes(query)))
      .sort((a,b)=>a.surname.localeCompare(b.surname)||a.first_name.localeCompare(b.first_name));
  },[roster,currentOffering,studentSearch,classEnrollments]);

  async function act(callback,success){
    setBusy(true);setNotice('');setError('');
    try{
      await callback();
      setSelectedStudents([]);setStatusReason('');setEditingEnrollment('');
      await refresh();
      setNotice(success);
    }catch(e){setError(e.message||'Action failed. No changes were confirmed.');}
    finally{setBusy(false);}
  }
  if(!context?.admin)return null;

  return <MotionPage>
    <Title eyebrow="ACADEMIC WORKSPACE"
      description="Organize subjects into semesters and enroll official roster students without duplicating identities. Legacy attendance and grades remain unchanged."
      actions={<button type="button" className="btn subtle" disabled={busy||loading} onClick={()=>refresh()}>Refresh</button>}
    >Classes & enrollments</Title>
    <PageAlert message={error} onClose={()=>setError('')}/>
    {notice&&<p className="academic-success" role="status">{notice}</p>}
    {loading&&!workspace&&<Card><p role="status">Loading the academic workspace…</p></Card>}
    {workspace&&!workspace.installed&&<Card>
      <h2>Academic database setup required</h2>
      <p>Install migration <code>202611280007_academic_classes_enrollments.sql</code> after reviewing migrations 001–006 and backing up Supabase. No class or student information was changed.</p>
    </Card>}
    {workspace?.installed&&<>
      <div className="academic-setup-grid">
        <Card className="academic-setup-panel">
          <span className="academic-step">01 / ACADEMIC YEAR</span>
          <h2>Create an academic year</h2>
          <form onSubmit={event=>{event.preventDefault();act(()=>createAcademicYear(year.label,year.starts,year.ends),'Academic year created.');}}>
            <label>School year <input required pattern="20[0-9]{2}-20[0-9]{2}" value={year.label} onChange={e=>setYear({...year,label:e.target.value})}/></label>
            <div className="academic-field-pair">
              <label>Start date <input required type="date" value={year.starts} onChange={e=>setYear({...year,starts:e.target.value})}/></label>
              <label>End date <input required type="date" value={year.ends} onChange={e=>setYear({...year,ends:e.target.value})}/></label>
            </div>
            <button className="btn outline" disabled={busy} type="submit">Create year</button>
          </form>
        </Card>
        <Card className="academic-setup-panel">
          <span className="academic-step">02 / SEMESTER</span>
          <h2>Create a semester</h2>
          <form onSubmit={event=>{event.preventDefault();act(()=>createAcademicTerm(term.year,term.name,term.starts,term.ends),'Semester created.');}}>
            <label>Academic year <select required value={term.year} onChange={e=>setTerm({...term,year:e.target.value})}>
              <option value="">Select year</option>{years.map(y=><option key={y.id} value={y.id}>{y.label}</option>)}
            </select></label>
            <label>Semester <select value={term.name} onChange={e=>setTerm({...term,name:e.target.value})}>
              <option>1st Semester</option><option>2nd Semester</option>
            </select></label>
            <div className="academic-field-pair">
              <label>Start <input required type="date" value={term.starts} onChange={e=>setTerm({...term,starts:e.target.value})}/></label>
              <label>End <input required type="date" value={term.ends} onChange={e=>setTerm({...term,ends:e.target.value})}/></label>
            </div>
            <button className="btn outline" type="submit" disabled={busy||!years.length}>Create semester</button>
          </form>
        </Card>
      </div>
      <Card className="academic-workspace">
        <div className="academic-workspace-head">
          <div><span className="academic-step">03 / CLASS OFFERINGS</span><h2>Classes in this semester</h2>
            <p>One subject and section per class, with an independent enrollment roster.</p></div>
          <label>Selected semester
            <select value={activeTerm} onChange={e=>{setSelectedTerm(e.target.value);setSelectedOffering('');setSelectedStudents([]);}}>
              {availableTerms.length===0&&<option value="">Create a semester first</option>}
              {availableTerms.map(t=><option value={t.id} key={t.id}>{years.find(y=>y.id===t.academic_year_id)?.label} · {t.name}</option>)}
            </select>
          </label>
        </div>
        {currentTerm&&<p className="academic-period-note">Term dates: {dateRange(currentTerm.starts_on,currentTerm.ends_on)}</p>}
        <form className="academic-create-class" onSubmit={event=>{event.preventDefault();act(()=>createClassOffering(activeTerm,offering.section,offering.subject,offering.program,offering.yearLevel,offering.room),'Class offering created.');}}>
          <label>Section <select required value={offering.section} onChange={e=>setOffering({...offering,section:e.target.value})}>
            <option value="">Select</option>{sections.map(s=><option key={s.id} value={s.id}>{s.code}</option>)}
          </select></label>
          <label>Subject <select required value={offering.subject} onChange={e=>setOffering({...offering,subject:e.target.value})}>
            <option value="">Select</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.code}</option>)}
          </select></label>
          <label>Program (optional) <input maxLength={80} value={offering.program} onChange={e=>setOffering({...offering,program:e.target.value})} placeholder="Program"/></label>
          <label>Year level (optional) <select value={offering.yearLevel} onChange={e=>setOffering({...offering,yearLevel:e.target.value})}>
            <option value="">—</option>{[1,2,3,4,5,6].map(y=><option key={y} value={y}>{y}</option>)}
          </select></label>
          <label>Room (optional) <input maxLength={80} value={offering.room} onChange={e=>setOffering({...offering,room:e.target.value})} placeholder="Laboratory"/></label>
          <button className="btn primary" type="submit" disabled={busy||!activeTerm}>Create class</button>
        </form>
        {!matchingOfferings.length?<Empty>No classes for this semester yet.</Empty>:
          <div className="academic-class-tabs" role="group" aria-label="Choose a class offering">
            {matchingOfferings.map(o=><button key={o.id} type="button"
              className={`academic-class-tab ${String(o.id)===activeOffering?'selected':''}`}
              aria-pressed={String(o.id)===activeOffering}
              onClick={()=>{setSelectedOffering(String(o.id));setSelectedStudents([]);setStudentSearch('');setEditingEnrollment('');}}>
              <strong>{offeringTitle(o,sections,subjects)}</strong>
              <small>{enrollments.filter(e=>e.offering_id===o.id&&e.status==='enrolled').length} enrolled</small>
              {o.status==='archived'&&<Badge>Archived</Badge>}
            </button>)}
          </div>}
      </Card>
      {currentOffering&&<Card className="academic-workspace">
        <div className="academic-workspace-head">
          <div><span className="academic-step">04 / CLASS ROSTER</span>
            <h2>{offeringTitle(currentOffering,sections,subjects)}</h2>
            <p>{currentOffering.room||'Room not specified'} · {currentOffering.program||'Program not specified'}</p></div>
          <Badge tone={currentOffering.status==='archived'?'muted':'good'}>{currentOffering.status}</Badge>
        </div>
        <div className="academic-meeting-list">
          {meetingRows.filter(m=>m.offering_id===currentOffering.id)
            .map(m=><span key={m.id}>{DAYS[m.weekday]} · {m.start_time.slice(0,5)}–{m.end_time.slice(0,5)}</span>)}
        </div>
        <h3>Enrolled students <span className="academic-count">{classEnrollments.length}</span></h3>
        <div className="academic-table-wrap"><table className="academic-table">
          <thead><tr><th>Student no.</th><th>Official name at enrollment</th><th>Enrolled</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{classEnrollments.map(e=><tr key={e.id}>
            <td>{e.student_number}</td><td>{enrollmentName(e)}</td><td>{e.enrolled_on}</td>
            <td><Badge tone={e.status==='enrolled'?'good':'muted'}>{e.status}</Badge></td>
            <td><button type="button" className="academic-link-button"
              disabled={busy||currentOffering.status==='archived'}
              onClick={()=>{setEditingEnrollment(String(e.id));setNextStatus(e.status==='enrolled'?'dropped':'enrolled');setStatusReason('');}}>
              Change status</button></td>
          </tr>)}</tbody>
        </table></div>
        {!classEnrollments.length&&<Empty>Students have not been enrolled in this subject yet.</Empty>}
        {editingEnrollment&&<form className="academic-status-panel" onSubmit={event=>{
          event.preventDefault();
          if(!window.confirm('Change this enrollment status? The change will be audited and history retained.'))return;
          act(()=>updateEnrollmentStatus(editingEnrollment,nextStatus,statusReason),'Enrollment status updated.');
        }}>
          <label>New status <select value={nextStatus} onChange={e=>setNextStatus(e.target.value)}>
            <option value="enrolled">Enrolled</option><option value="dropped">Dropped</option><option value="completed">Completed</option>
          </select></label>
          <label>Reason <input required minLength={8} maxLength={500} value={statusReason}
            onChange={e=>setStatusReason(e.target.value)} placeholder="Reason for the change"/></label>
          <button className="btn primary" disabled={busy} type="submit">Save change</button>
          <button className="btn subtle" type="button" onClick={()=>setEditingEnrollment('')}>Cancel</button>
        </form>}
        {currentOffering.status==='active'&&<div className="academic-enroll">
          <div><h3>Add official roster students</h3>
            <p>Only students whose official section matches this class appear. Accounts do not have to be registered yet.</p>
          </div>
          <div className="academic-enroll-controls">
            <label>Enrollment date <input type="date" required min={currentTerm?.starts_on} max={currentTerm?.ends_on}
              value={enrolledOn} onChange={e=>setEnrolledOn(e.target.value)}/></label>
            <label>Find student <input value={studentSearch} onChange={e=>setStudentSearch(e.target.value)}
              placeholder="Name or student number"/></label>
          </div>
          <p className="academic-subtle">{selectedStudents.length} selected · {eligible.length} eligible not yet enrolled</p>
          <div className="academic-student-picker">
            {eligible.map(r=><label key={r.student_number} className="academic-picker-row">
              <input type="checkbox" checked={selectedStudents.includes(r.student_number)}
                disabled={busy||(!selectedStudents.includes(r.student_number)&&selectedStudents.length>=200)}
                onChange={e=>setSelectedStudents(old=>e.target.checked?[...old,r.student_number]:old.filter(n=>n!==r.student_number))}/>
              <span>{r.surname}, {r.first_name} {r.middle_initial}</span>
              <small>{r.student_number}</small>
            </label>)}
            {!eligible.length&&<Empty>No unmatched students in this section.</Empty>}
          </div>
          <div className="academic-action-row">
            <button type="button" className="btn subtle" onClick={()=>
              setSelectedStudents(eligible.slice(0,200).map(s=>s.student_number))} disabled={busy||!eligible.length}>Select displayed (up to 200)</button>
            <button type="button" className="btn subtle" onClick={()=>setSelectedStudents([])} disabled={busy}>Clear</button>
            <button type="button" className="btn primary" disabled={busy||!selectedStudents.length||
              !currentTerm||enrolledOn<currentTerm.starts_on||enrolledOn>currentTerm.ends_on}
              onClick={()=>{
                if(!window.confirm(`Enroll ${selectedStudents.length} student(s) into this class?`))return;
                act(()=>enrollClassStudents(currentOffering.id,selectedStudents,enrolledOn),'Roster updated.');
              }}>Enroll selected</button>
          </div>
        </div>}
        {currentOffering.status==='active'&&<div className="academic-archive">
          <p>Archiving prevents further enrollment changes but preserves records.</p>
          <button type="button" className="btn outline" disabled={busy}
            onClick={()=>{
              if(!window.confirm('Archive this class? The class and its enrollments will remain for historical viewing.'))return;
              act(()=>archiveClassOffering(currentOffering.id),'Class archived.');
            }}>Archive class</button>
        </div>}
      </Card>}
      <p className="academic-footer-note">The current Attendance, Reports, and Class Records pages continue using their existing data until Phase 3 and Phase 4 migrations link historical sessions and assessments to class offering IDs. <Link to="/admin/classes">Existing class timetable</Link></p>
    </>}
  </MotionPage>;
}
