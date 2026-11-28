// Date-based attendance presentation. All mutations/authorization live in SQL.
// Philippine civil dates are used, not the viewer's browser time zone.
import {isoWeekdayForDate} from './daily-register.js';
import {windowIsOpen} from './schedule.js';

export const REGISTER_STATUSES=['Present','Late','Absent','Excused','Not Yet Recorded'];
const pad=n=>String(n).padStart(2,'0');
export function validCalendarDate(v) {
  return typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && isoWeekdayForDate(v)!=null;
}
export function monthDates(month){
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(month)))return [];
  const [y,m]=month.split('-').map(Number),count=new Date(Date.UTC(y,m,0)).getUTCDate();
  return Array.from({length:count},(_,i)=>`${month}-${pad(i+1)}`);
}
export function shiftCalendarMonth(month,delta){
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(month)))return month;
  const [y,m]=month.split('-').map(Number);
  const d=new Date(Date.UTC(y,m-1+delta,1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}`;
}
export function getDateSessions(data,date,reviewByWindow={},now=new Date()){
  if(!validCalendarDate(date))return [];
  const {schedules=[],windows=[],sections=[],subjects=[]}=data||{};
  const dow=isoWeekdayForDate(date);
  const sec=new Map(sections.map(s=>[Number(s.id),s.code]));
  const sub=new Map(subjects.map(s=>[Number(s.id),s.code]));
  return schedules.flatMap(schedule=>{
    const window=windows.find(w=>Number(w.schedule_id)===Number(schedule.id) && w.meeting_date===date);
    // Preserve actually recorded meetings even if their recurring weekday changed later.
    if(Number(schedule.weekday)!==dow && !window)return [];
    const review=window?reviewByWindow[window.id]:null;
    const open=windowIsOpen(window,now);
    let status;
    if(review?.status==='Cancelled')status='Cancelled';
    else if(review?.status==='Finalized')status='Finalized';
    else if(!window)status='Scheduled · not opened';
    else if(open)status=window.is_override?'Extra session open':'Open';
    else status='Closed / expired';
    return [{
      key:`${schedule.id}:${date}`,scheduleId:Number(schedule.id),
      sectionId:Number(schedule.section_id),subjectId:Number(schedule.subject_id),
      section:sec.get(Number(schedule.section_id))||'—',
      subject:sub.get(Number(schedule.subject_id))||'—',
      weekday:Number(schedule.weekday),start:schedule.start_time,end:schedule.end_time,
      windowId:window?.id||null,review:review||null,status,
      isOverride:Boolean(window?.is_override),active:open && review?.status!=='Cancelled'
    }];
  }).sort((a,b)=>a.start.localeCompare(b.start)||a.section.localeCompare(b.section)||a.subject.localeCompare(b.subject));
}
export function getMonthSessions(data,month,reviewByWindow={},now=new Date()){
  return monthDates(month).map(date=>({date,sessions:getDateSessions(data,date,reviewByWindow,now)}));
}
export function resolveStudentStatus(entry,attendance=[],profiles=[],windowId){
  // Administrative correction overrides the automated check-in only in the
  // private instructor register; student check-in records remain unchanged.
  if(entry.recorded_status)return entry.recorded_status;
  const linked=new Set([entry.linked_user_id].filter(Boolean));
  for(const p of profiles)if(String(p.student_number||'')===String(entry.student_number))linked.add(p.user_id);
  return attendance.some(a=>Number(a.attendance_window_id)===Number(windowId) && linked.has(a.student_id))
    ? 'Present' : 'Not Yet Recorded';
}
export function sessionRegisterRows(entries,attendance,profiles,windowId){
  return entries.map(e=>({
    ...e,
    status:resolveStudentStatus(e,attendance,profiles,windowId)
  })).sort((a,b)=>a.student_name_snapshot.localeCompare(b.student_name_snapshot,'en'));
}
// Preview only, for a date with no opened session or a legacy session without
// a captured roster. Based on the CURRENT roster and never persisted as history.
export function previewOfficialRoster(data,sectionId,windowId=null){
  const {roster=[],profiles=[],attendance=[]}=data||{};
  return roster.filter(r=>r.active!==false&&Number(r.section_id)===Number(sectionId))
    .map(r=>{
      const linked=profiles.find(p=>String(p.student_number||'')===String(r.student_number));
      const entry={
        student_number:String(r.student_number),
        student_name_snapshot:r.full_name||
          `${r.surname}, ${r.first_name} ${r.middle_initial||''}`.trim(),
        linked_user_id:r.linked_user_id||linked?.user_id||null,
        recorded_status:null,
        remarks:null
      };
      return {...entry,status:windowId?
        resolveStudentStatus(entry,attendance,profiles,windowId):'Not Yet Recorded'};
    }).sort((a,b)=>a.student_name_snapshot.localeCompare(b.student_name_snapshot,'en'));
}

export function summarizeCalendarMonth(days){
  return (days||[]).reduce((s,d)=>{
    for(const row of d.sessions){
      s.scheduled++;
      if(row.windowId)s.opened++;
      if(row.status==='Finalized')s.finalized++;
      if(row.status==='Cancelled')s.cancelled++;
    }
    return s;
  },{scheduled:0,opened:0,finalized:0,cancelled:0});
}

export function summarizeRegister(rows) {
  const summary={total:rows.length,Present:0,Late:0,Absent:0,Excused:0,'Not Yet Recorded':0};
  for(const r of rows)if(Object.prototype.hasOwnProperty.call(summary,r.status))summary[r.status]++;
  return summary;
}
const csvCell=value=>{
  let v=String(value??'');
  // Spreadsheet formula injection safety when exporting private identifiers.
  if(/^\s*[=+@\-\t\r]/.test(v))v=`'${v}`;
  return '"'+v.replaceAll('"','""')+'"';
};
export function exportRegisterCsv(rows,{date,section,subject,sessionStatus}={}) {
  const columns=['Date','Section','Subject','Session status','Student number','Official full name','Attendance status','Remarks'];
  const body=rows.map(r=>[date,section,subject,sessionStatus,r.student_number,r.student_name_snapshot,r.status,r.remarks||'']);
  return '\uFEFF'+[columns,...body].map(row=>row.map(csvCell).join(',')).join('\r\n');
}
