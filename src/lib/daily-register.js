// Day-based attendance register. Uses a private, RLS-protected official roster.
// Client presentation only: PostgreSQL RPCs remain attendance authorization.
import { windowIsOpen } from './schedule.js';

const sortCode = (a,b) => String(a).localeCompare(String(b), 'en', {numeric:true});
export function isoWeekdayForDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const d = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0,10) !== value) return null;
  return d.getUTCDay() === 0 ? 7 : d.getUTCDay();
}

export function buildDailyRosterReport(
  {roster=[], profiles=[], schedules=[], windows=[], attendance=[], sections=[], subjects=[]} = {},
  {date='', sectionId='', subjectId=''}={}, now=new Date()
) {
  const weekday=isoWeekdayForDate(date);
  if (!weekday) return [];
  const sectionNames=new Map(sections.map(s=>[Number(s.id),s.code]));
  const subjectNames=new Map(subjects.map(s=>[Number(s.id),s.code]));
  const byNumber=new Map(profiles.filter(p=>p.student_number).map(p=>[String(p.student_number),p]));
  const present=new Set(attendance.filter(a=>a.attendance_window_id!=null)
    .map(a=>`${a.attendance_window_id}:${a.student_id}`));
  const rows=[];
  for (const schedule of schedules) {
    // Instructor-created extra sessions appear on their actual meeting date,
    // even when they do not match the usual weekly timetable.
    const window=windows.find(w=>Number(w.schedule_id)===Number(schedule.id)&&w.meeting_date===date);
    if (Number(schedule.weekday)!==weekday && !window?.is_override) continue;
    if (sectionId && Number(schedule.section_id)!==Number(sectionId)) continue;
    if (subjectId && Number(schedule.subject_id)!==Number(subjectId)) continue;
    const isOpen=windowIsOpen(window,now);
    const members=roster.filter(r=>r.active!==false&&Number(r.section_id)===Number(schedule.section_id));
    const linked=new Set(members.map(r=>String(r.linked_user_id||byNumber.get(String(r.student_number))?.user_id||'')).filter(Boolean));
    const legacy=profiles.filter(p=>p.is_approved && Number(p.section_id)===Number(schedule.section_id)
      && !p.student_number && !linked.has(String(p.user_id)));
    for (const entry of [...members.map(r=>({kind:'official',r})),...legacy.map(p=>({kind:'legacy',p}))]) {
      const {kind,r,p}=entry;
      const profile=kind==='official' ? (byNumber.get(String(r.student_number)) || profiles.find(p=>p.user_id===r.linked_user_id)) : p;
      const id=profile?.user_id || null;
      const attended=Boolean(window && id && present.has(`${window.id}:${id}`));
      const status=attended ? 'Present' : !window ? 'Not opened' : isOpen ? 'Open / waiting' : 'Not checked in';
      const name=kind==='official' ? r.full_name || `${r.surname}, ${r.first_name} ${r.middle_initial}` : `${p.surname}, ${p.first_name} ${p.middle_initial}`;
      rows.push({
        date, scheduleId:Number(schedule.id), windowId:window?.id||null,
        section:sectionNames.get(Number(schedule.section_id))||'—',
        subject:subjectNames.get(Number(schedule.subject_id))||'—',
        time:`${String(schedule.start_time).slice(0,5)}–${String(schedule.end_time).slice(0,5)}`,
        studentNumber:kind==='official' ? String(r.student_number) : '',
        student:name, github:profile?.github_username||'',
        account:profile ? profile.is_approved ? 'Approved' : 'Pending' : 'Not registered',
        kind, status, needsReview:kind==='official' && Boolean(r.name_needs_review)
      });
    }
  }
  return rows.sort((a,b)=> sortCode(a.section,b.section)||sortCode(a.subject,b.subject)
    ||sortCode(a.time,b.time)||sortCode(a.student,b.student));
}

export function summarizeDailyRoster(rows) {
  return {
    meetings:new Set(rows.map(r=>r.scheduleId)).size,
    expected:rows.length,
    present:rows.filter(r=>r.status==='Present').length,
    unrecorded:rows.filter(r=>r.status==='Not checked in').length,
    waiting:rows.filter(r=>r.status==='Open / waiting').length,
    notOpened:rows.filter(r=>r.status==='Not opened').length,
    needsReview:rows.filter(r=>r.needsReview).length,
  };
}

export function toDailyRosterCsv(rows) {
  const headers=['Date','Time (24h PHT)','Section','Subject','Student number','Full name','GitHub','Registration','Attendance'];
  const fields=[r=>r.date,r=>r.time,r=>r.section,r=>r.subject,r=>r.studentNumber,
    r=>r.student,r=>r.github,r=>r.account,r=>r.status];
  const cell=value=>{
    let v=String(value??'');
    if (/^\s*[=+@\-\t\r]/.test(v))v=`'${v}`;
    return `"${v.replace(/"/g,'""')}"`;
  };
  return '\uFEFF'+[headers.map(cell).join(','),...rows.map(r=>fields.map(f=>cell(f(r))).join(','))].join('\r\n');
}
