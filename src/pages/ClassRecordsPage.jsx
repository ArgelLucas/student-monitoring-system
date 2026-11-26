import React,{useEffect,useMemo,useRef,useState} from 'react';
import {BookOpen,ChevronDown,ClipboardList,Download,Plus,RefreshCw,Save,ShieldCheck,Trash2,AlertCircle} from 'lucide-react';
import {Badge,Card,MotionPage,Title} from '../components/UI.jsx';
import {useSession} from '../state/SessionProvider.jsx';
import {getClassRecordData,addClassRecordAssessment,removeClassRecordAssessment,persistClassRecordScores} from '../lib/api.js';
import {CLASS_RECORD_CATEGORIES,CLASS_RECORD_WEIGHTS,calculateTermGrade,calculateFinalGrade,
  classRecordsCsv,scoreKey,validateScore} from '../lib/class-records.js';

const emptyData={students:[],assessments:[],scores:[]};
const makeScoreMap = rows => Object.fromEntries(rows.map(r=>[scoreKey(r.assessment_id,r.student_number),String(r.score)]));
const safeFilename = value=>String(value).replace(/[^a-zA-Z0-9-_]/g,'-');
function downloadText(name,contents) {
  const url=URL.createObjectURL(new Blob([contents],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=name;
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const gradeLabel = result => result.grade===null ? '—' : `${result.grade.toFixed(2)}%`;

export function ClassRecordsPage(){
  const {data}=useSession();
  const [sectionId,setSectionId]=useState(()=>String(data?.sections?.[0]?.id||''));
  const subjects=useMemo(()=>data?.subjects?.filter(s=>data.schedules.some(meeting=>
    String(meeting.section_id)===sectionId && String(meeting.subject_id)===String(s.id)))||[],[data,sectionId]);
  const [subjectId,setSubjectId]=useState('');
  const [term,setTerm]=useState('Midterm');
  const [academicYear,setAcademicYear]=useState('2026-2027');
  const [semester,setSemester]=useState('1st Semester');
  const yearOptions=Array.from({length:16},(_,index)=>{const y=2020+index;return `${y}-${y+1}`;});
  const [records,setRecords]=useState(emptyData);
  const [otherRecords,setOtherRecords]=useState(emptyData);
  const [scores,setScores]=useState({});
  const [savedScores,setSavedScores]=useState({});
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [query,setQuery]=useState('');
  const [adding,setAdding]=useState(false);
  const [newAssessment,setNewAssessment]=useState({title:'',category:'Activities',max_score:'20',assessment_date:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'})});
  const request=useRef(0);
  const dirty=useMemo(()=>Object.keys(scores).filter(k=>scores[k]!==savedScores[k]),[scores,savedScores]);
  // HashRouter is a declarative router (not a data router); useBlocker is
  // unavailable here. Intercept ordinary sidebar links instead, and keep the
  // browser-unload guard above for a full tab close/reload.
  useEffect(()=>{
    if(!dirty.length) return;
    const warnOnLink=event=>{
      const anchor=event.target?.closest?.('a[href]');
      if(!anchor||anchor.getAttribute('href')?.includes('#/admin/class-records'))return;
      if(!window.confirm('Leave Class Records and discard unsaved scores?')){
        event.preventDefault();event.stopPropagation();
      }
    };
    document.addEventListener('click',warnOnLink,true);
    return()=>document.removeEventListener('click',warnOnLink,true);
  },[dirty.length]);
  const isOverall=term==='Overall';
  const selectedSubject=subjects.find(s=>String(s.id)===subjectId);
  const sectionCode=data?.sections?.find(s=>String(s.id)===sectionId)?.code||'—';
  const allowedSubjects=subjects;
  // Preserve grades if the user accidentally navigates away from an unsaved grid.
  useEffect(()=>{const handler=e=>{if(dirty.length){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);
  },[dirty.length]);
  useEffect(()=>{
    if(!allowedSubjects.some(s=>String(s.id)===subjectId))setSubjectId(String(allowedSubjects[0]?.id||''));
  },[allowedSubjects,subjectId]);
  async function load(currentSection=sectionId,currentSubject=subjectId,currentTerm=term,currentYear=academicYear,currentSemester=semester){
    if(!currentSection||!currentSubject) {setRecords(emptyData);setScores({});setSavedScores({});return;}
    const nonce=++request.current;setLoading(true);setError('');setNotice('');
    try {
      if(currentTerm==='Overall') {
        const [mid,final]=await Promise.all([
          getClassRecordData(currentSection,currentSubject,'Midterm',currentYear,currentSemester),
          getClassRecordData(currentSection,currentSubject,'Final',currentYear,currentSemester)]);
        if(request.current!==nonce)return;
        setRecords(mid);setOtherRecords(final);
        setScores({...makeScoreMap(mid.scores),...makeScoreMap(final.scores)});
        setSavedScores({...makeScoreMap(mid.scores),...makeScoreMap(final.scores)});
      } else {
        const next=await getClassRecordData(currentSection,currentSubject,currentTerm,currentYear,currentSemester);
        if(request.current!==nonce)return;
        setRecords(next);setOtherRecords(emptyData);
        const map=makeScoreMap(next.scores);setScores(map);setSavedScores(map);
      }
    } catch(e) {if(request.current===nonce){setError(`${e.message||'Cannot load class records'}. Confirm migrations 004 and 005 are installed.`);setRecords(emptyData);}}
    finally {if(request.current===nonce)setLoading(false);}
  }
  useEffect(()=>{void load();return()=>{request.current++;};},[sectionId,subjectId,term,academicYear,semester]);
  function changeScope(next){
    if(dirty.length&&!window.confirm('Discard unsaved score changes?'))return;
    if(next.sectionId!==undefined){setSectionId(next.sectionId);setSubjectId('');}
    if(next.subjectId!==undefined)setSubjectId(next.subjectId);
    if(next.term!==undefined)setTerm(next.term);
    if(next.academicYear!==undefined)setAcademicYear(next.academicYear);
    if(next.semester!==undefined)setSemester(next.semester);
    setAdding(false);
  }
  const students=useMemo(()=>records.students.filter(s=>`${s.student_number} ${s.full_name}`.toLowerCase().includes(query.trim().toLowerCase())),[records.students,query]);
  const categories=CLASS_RECORD_CATEGORIES.map(name=>({name,weight:CLASS_RECORD_WEIGHTS[name],assessments:records.assessments.filter(a=>a.category===name)}));
  const validationIssues=useMemo(()=>{
    const errors=[];
    for(const key of dirty){const id=Number(key.split(':',1)[0]);const assessment=records.assessments.find(a=>Number(a.id)===id);
      if(!assessment)continue;
      const e=validateScore(scores[key]??'',assessment.max_score);
      if(e) errors.push(`${assessment.title}: ${e}`);
    }
    return errors;
  },[dirty,scores,records.assessments]);
  async function save(){
    if(!dirty.length||validationIssues.length)return;
    setSaving(true);setError('');setNotice('');
    const changes=dirty.map(k=>{const [assessment_id,...rest]=k.split(':');const value=scores[k];return {
      assessment_id:Number(assessment_id),student_number:rest.join(':'),score:value===''||value===undefined?null:Number(value)};});
    try {await persistClassRecordScores(changes);await load();setNotice(`${changes.length} score changes saved to Supabase.`);}
    catch(e){setError(e.message||'Unable to save score changes. Refresh and check the entries.');}
    finally{setSaving(false);}
  }
  async function addItem(event){
    event.preventDefault();
    const title=newAssessment.title.trim();const maximum=Number(newAssessment.max_score);
    if(!title||!Number.isFinite(maximum)||maximum<=0||maximum>1000) {setError('Enter a title and maximum score from 0.01 to 1000.');return;}
    setSaving(true);setError('');
    try {await addClassRecordAssessment({section_id:Number(sectionId),subject_id:Number(subjectId),term,academic_year:academicYear,semester,
      category:newAssessment.category,title,max_score:maximum,assessment_date:newAssessment.assessment_date});
      setAdding(false);setNewAssessment({...newAssessment,title:''});await load();setNotice('Assessment added. All scores are initially blank.');}
    catch(e){setError(e.message||'Could not create assessment.');}finally{setSaving(false);}
  }
  async function deleteItem(item){
    if(!window.confirm(`Delete “${item.title}” and ALL its saved scores? This cannot be undone.`))return;
    setSaving(true);setError('');
    try{await removeClassRecordAssessment(item.id);await load();setNotice('Assessment deleted.');}
    catch(e){setError(e.message||'Unable to delete the assessment.');}finally{setSaving(false);}
  }
  function exportCsv(){
    const suffix=`${safeFilename(academicYear)}-${safeFilename(semester)}`;
    if(isOverall){const headings=['Student number','Official full name','Section','Subject','Midterm','Final term','Final grade','Equivalent','Remark'];
      const rows=records.students.map(r=>{const a=calculateTermGrade(records.assessments,scores,r.student_number);
        const b=calculateTermGrade(otherRecords.assessments,scores,r.student_number);
        const result=calculateFinalGrade(a,b);
        return [r.student_number,r.full_name,sectionCode,selectedSubject?.code||'',a.grade??'',b.grade??'',result.grade??'',result.equivalent??'',result.remark];});
      const cell=s=>{let t=String(s??'');if(/^\s*[=+@\-\t\r]/.test(t))t="'"+t;return `"${t.replaceAll('"','""')}"`;};
      downloadText(`ClassRecords-${suffix}-${safeFilename(sectionCode)}-${safeFilename(selectedSubject?.code||'Subject')}-Overall.csv`, '\uFEFF'+[headings,...rows].map(r=>r.map(cell).join(',')).join('\r\n'));
    } else downloadText(`ClassRecords-${suffix}-${safeFilename(sectionCode)}-${safeFilename(selectedSubject?.code||'Subject')}-${term}.csv`,
      classRecordsCsv(records.students,records.assessments,scores,term,sectionCode,selectedSubject?.code||''));
  }
  return <MotionPage>
    <div className="class-records-page">
      <Title eyebrow="ACADEMIC RECORDS" description="Private instructor gradebook · official student roster · Philippine time">Class records</Title>
      <div className="class-records-context">
        <div className="class-records-context-label"><ClipboardList size={18}/><div><strong>Gradebook workspace</strong><span>Modeled on your 2026–2027 grading sheet</span></div></div>
        <div className="class-records-controls">
          <label>School year<select value={academicYear} onChange={e=>changeScope({academicYear:e.target.value})}>{yearOptions.map(y=><option key={y}>{y}</option>)}</select></label>
          <label>Semester<select value={semester} onChange={e=>changeScope({semester:e.target.value})}><option>1st Semester</option><option>2nd Semester</option></select></label>
          <label>Section<select value={sectionId} onChange={e=>changeScope({sectionId:e.target.value})}>{data.sections.map(s=><option key={s.id} value={s.id}>{s.code}</option>)}</select></label>
          <label>Subject<select value={subjectId} onChange={e=>changeScope({subjectId:e.target.value})}>{subjects.map(s=><option key={s.id} value={s.id}>{s.code}</option>)}</select></label>
          <label>Grade period<select value={term} onChange={e=>changeScope({term:e.target.value})}><option>Midterm</option><option value="Final">Final term</option><option value="Overall">Overall grade</option></select></label>
        </div>
      </div>
      <div className="class-records-weight-strip" aria-label="Grade weights">
        {CLASS_RECORD_CATEGORIES.map(category=><span key={category}><b>{category}</b><strong>{Math.round(CLASS_RECORD_WEIGHTS[category]*100)}%</strong></span>)}
      </div>
      <div className="class-records-toolbar">
        <div className="class-records-counter"><strong>{records.students.length}</strong> official students <span className="class-records-small-divider">/</span> <strong>{isOverall?records.assessments.length+otherRecords.assessments.length:records.assessments.length}</strong> assessments</div>
        <div className="class-records-actions">
          <input aria-label="Search class records" placeholder="Search name or student no." value={query} onChange={e=>setQuery(e.target.value)}/>
          <button className="btn outline" type="button" disabled={loading||saving||!!dirty.length} onClick={()=>load()}><RefreshCw size={16}/>Refresh</button>
          {!isOverall&&<button className="btn outline" type="button" onClick={()=>setAdding(v=>!v)} disabled={loading||saving}><Plus size={16}/>New assessment</button>}
          <button className="btn outline" type="button" disabled={loading||!records.students.length||!!dirty.length} onClick={exportCsv}><Download size={16}/>Export CSV</button>
        </div>
      </div>
      {error&&<div className="class-records-alert" role="alert"><AlertCircle size={18}/>{error}</div>}
      {notice&&<div className="class-records-notice" role="status"><ShieldCheck size={17}/>{notice}</div>}
      {validationIssues.length>0&&<p className="class-records-alert" role="alert">{validationIssues[0]}{validationIssues.length>1?` · ${validationIssues.length} invalid entries`:''}</p>}
      {adding&&!isOverall&&<form className="class-records-add-form" onSubmit={addItem}>
        <div className="class-records-add-title"><BookOpen size={17}/><strong>New {term.toLowerCase()} assessment</strong></div>
        <label>Assessment title<input required maxLength={80} placeholder="e.g. Quiz 1, Project 2" value={newAssessment.title} onChange={e=>setNewAssessment(v=>({...v,title:e.target.value}))}/></label>
        <label>Category<select value={newAssessment.category} onChange={e=>setNewAssessment(v=>({...v,category:e.target.value}))}>{CLASS_RECORD_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>
        <label>Maximum points<input type="number" min="0.01" max="1000" step="0.01" required value={newAssessment.max_score} onChange={e=>setNewAssessment(v=>({...v,max_score:e.target.value}))}/></label>
        <label>Date<input type="date" required value={newAssessment.assessment_date} onChange={e=>setNewAssessment(v=>({...v,assessment_date:e.target.value}))}/></label>
        <button className="btn primary" disabled={saving}>Create assessment</button>
      </form>}
      <Card className="class-records-card">
        <div className="class-records-table-top"><div><strong>{sectionCode} · {selectedSubject?.code||'Choose a subject'}</strong><p>{isOverall?'Final summary — average of Midterm and Final Term':'Enter each assessment score, then save your changes.'}</p></div>
          <Badge tone="muted">{academicYear} · {semester} · {term==='Final'?'Final term':term}</Badge></div>
        {loading?<div className="class-records-loading" role="status">Loading your private class records…</div>:!records.students.length?<div className="class-records-empty">No official student roster is available for this section. Import the private roster after running migration 004, then reload.</div>:
        <div className="class-records-table-scroll" tabIndex={0} aria-label="Scrollable class records">
          <table className="class-records-table"><thead>
            <tr><th className="class-records-sticky-number">STUDENT NO.</th><th className="class-records-sticky-name">OFFICIAL STUDENT NAME</th>
              {isOverall?<><th>MIDTERM</th><th>FINAL TERM</th><th>FINAL GRADE</th><th>EQUIVALENT</th><th>REMARK</th></>:
                <>{categories.flatMap(group=>group.assessments.map(item=><th key={item.id}><span className="class-records-th-category">{group.name}</span><span className="class-records-th-title">{item.title}</span><span className="class-records-th-max">/{item.max_score}</span>
                  <button className="class-records-remove" type="button" title={`Delete ${item.title}`} aria-label={`Delete assessment ${item.title}`} disabled={saving||!!dirty.length} onClick={()=>deleteItem(item)}><Trash2 size={13}/></button></th>))}
                  {CLASS_RECORD_CATEGORIES.map(category=><th key={category} className="class-records-weight-heading">{category}<small>{Math.round(CLASS_RECORD_WEIGHTS[category]*100)}% weighted</small></th>)}
                  <th className="class-records-result-heading">TERM GRADE</th><th>EQUIVALENT</th><th>REMARK</th></>}
            </tr></thead><tbody>
            {students.map(student=>{
              const mid=calculateTermGrade(records.assessments,scores,student.student_number);
              const final=isOverall?calculateTermGrade(otherRecords.assessments,scores,student.student_number):null;
              const overall=isOverall?calculateFinalGrade(mid,final):null;
              return <tr key={student.student_number}>
                <td className="class-records-sticky-number class-records-id">{student.student_number}</td>
                <td className="class-records-sticky-name"><strong>{student.full_name}</strong>{student.name_needs_review&&<small className="class-records-review">Verify spelling</small>}</td>
                {isOverall?<>
                  <td>{gradeLabel(mid)}</td><td>{gradeLabel(final)}</td><td className="class-records-grade"><strong>{gradeLabel(overall)}</strong></td><td>{overall.equivalent??'—'}</td>
                  <td><span className={`class-records-remark ${overall.grade!==null?(overall.grade>=74.5?'passed':'failed'):'pending'}`}>{overall.remark}</span></td>
                </>:<>
                  {categories.flatMap(group=>group.assessments.map(item=>{
                    const key=scoreKey(item.id,student.student_number);const value=scores[key]??'';const invalid=Boolean(validateScore(value,item.max_score));
                    return <td key={key} className="class-records-score-cell"><input aria-label={`${student.full_name}: ${item.title}, maximum ${item.max_score}`} type="number" inputMode="decimal" min="0" max={item.max_score} step="0.01" value={value} disabled={saving} className={invalid?'invalid':''}
                      onChange={e=>setScores(old=>({...old,[key]:e.target.value}))}/></td>;
                  }))}
                  {CLASS_RECORD_CATEGORIES.map(category=><td key={category} className="class-records-component">{mid.groups[category].weighted===null?'—':mid.groups[category].weighted.toFixed(2)}</td>)}
                  <td className="class-records-grade"><strong>{gradeLabel(mid)}</strong></td><td>{mid.equivalent??'—'}</td>
                  <td><span className={`class-records-remark ${mid.complete?(mid.grade>=74.5?'passed':'failed'):'pending'}`}>{mid.remark}</span></td>
                </>}
              </tr>;
            })}
            </tbody></table>
        </div>}
        <div className="class-records-table-foot"><span>Blank scores are <strong>ungraded</strong>, not zero. A grade is finalized only when all five categories have assessments and saved scores.</span>
          {!isOverall&&<button className="btn primary" type="button" disabled={!dirty.length||saving||loading||Boolean(validationIssues.length)} onClick={save}><Save size={16}/>{saving?'Saving…':`Save ${dirty.length} changes`}</button>}
        </div>
      </Card>
      <p className="class-records-security"><ShieldCheck size={15}/> Only administrators can read or change scores. Grades remain in Supabase; exported CSVs contain student information and should be handled privately.</p>
    </div>
  </MotionPage>;
}
