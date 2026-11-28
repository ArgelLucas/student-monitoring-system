import React,{useMemo,useState} from 'react';
import {Badge,Card,Empty} from './UI.jsx';
import {weekdayLabel,timeLabel} from '../lib/schedule.js';
import {buildOfficialClassDirectory,searchOfficialStudents} from '../lib/official-class-directory.js';
import '../styles/official-class-directory.css';

const YEARS=[{value:1,label:'1st Year'},{value:2,label:'2nd Year'},{value:3,label:'3rd Year'}];
export function OfficialClassDirectory({data}){
  const directory=useMemo(()=>buildOfficialClassDirectory(data),[data]);
  const [year,setYear]=useState(1);
  const sections=directory.filter(s=>s.year===year);
  const [chosen,setChosen]=useState('');
  const active=sections.find(s=>s.code===chosen)||sections[0];
  const [query,setQuery]=useState('');
  const matches=searchOfficialStudents(active?.members||[],query);
  return <Card className="official-classes">
    <div className="official-classes-heading">
      <div>
        <span className="official-eyebrow">YOUR OFFICIAL STUDENT LISTS</span>
        <h2>Year levels &amp; sections</h2>
        <p>Students come directly from the official roster in Supabase. No enrollment step or duplicate student profiles.</p>
      </div>
      <div className="official-total">{directory.reduce((n,s)=>n+s.studentCount,0)}<small>Current roster entries</small></div>
    </div>

    {!data.rosterReady&&<p role="alert" className="official-note">
      The official roster is not available in Supabase yet. Check the private roster import and migration 004; do not create students manually to work around it.
    </p>}
    <div className="official-year-tabs" role="group" aria-label="Select year level">
      {YEARS.map(y=><button type="button" key={y.value}
        aria-pressed={year===y.value}
        className={`official-tab ${year===y.value?'is-selected':''}`}
        onClick={()=>{setYear(y.value);setChosen('');setQuery('');}}>
        {y.label}
        <span>{directory.filter(s=>s.year===y.value).reduce((n,s)=>n+s.studentCount,0)} students</span>
      </button>)}
    </div>
    <div className="official-section-tabs" role="group" aria-label="Select section">
      {sections.map(s=><button type="button" key={s.code} aria-pressed={active?.code===s.code}
        className={`official-section ${active?.code===s.code?'is-selected':''}`}
        onClick={()=>{setChosen(s.code);setQuery('');}}>
        <strong>Section {s.code}</strong><span>{s.studentCount} students</span>
      </button>)}
    </div>

    {active&&<>
      <div className="official-details">
        <div><h3>Section {active.code} <span>· {YEARS.find(y=>y.value===active.year)?.label}</span></h3>
          <p>Live roster · {active.subjects.length} subject{active.subjects.length===1?'':'s'}</p></div>
        <label>Search roster
          <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
            placeholder="Student name or number" aria-label="Search official class roster"/>
        </label>
      </div>
      {active.sourceTerms.length>0&&<p className="official-source-note">
        Source term{active.sourceTerms.length===1?'':'s'} from original lists: <strong>{active.sourceTerms.join(', ')}</strong>.
        This identifies the roster's original source, not automatic enrollment in a new semester.
      </p>}

      <div className="official-subjects">
        {active.subjects.map(subject=><div className="official-subject" key={subject.id}>
          <strong>{subject.code}</strong>
          {subject.name&&subject.name!==subject.code&&<small>{subject.name}</small>}
          <div>{subject.meetings.map(s=><span key={s.id}>{weekdayLabel(s.weekday)} · {timeLabel(s.start_time)} – {timeLabel(s.end_time)}</span>)}</div>
        </div>)}
        {!active.subjects.length&&<p className="official-note">No published subject timetable is linked to this section.</p>}
      </div>
      <div className="official-roster-heading">
        <h3>Official student roster <span>({matches.length}{query?` of ${active.studentCount}`:''})</span></h3>
        {active.pendingReview>0&&<Badge tone="warn">{active.pendingReview} name reviews</Badge>}
      </div>
      <div className="official-roster-scroll">
        <table className="official-roster-table">
          <thead><tr><th>No.</th><th>Student number</th><th>Full name</th><th>Portal status</th></tr></thead>
          <tbody>{matches.map((s,i)=><tr key={s.studentNumber}>
            <td>{i+1}</td><td className="official-mono">{s.studentNumber}</td><td>{s.fullName} {s.needsReview&&<small className="official-review">Review name</small>}</td>
            <td><Badge tone={s.accountStatus==='Approved'?'good':'muted'}>{s.accountStatus}</Badge></td>
          </tr>)}</tbody>
        </table>
        {!matches.length&&<Empty>{query?'No students match this search.':'No students imported for this section yet.'}</Empty>}
      </div>
      <p className="official-footnote">Class attendance is recorded separately for each subject and meeting. A student appearing in this section does not count as present or graded automatically. Historical rosters require term-specific snapshots before finalization.</p>
    </>}
  </Card>;
}
