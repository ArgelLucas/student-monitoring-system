import { escapeHtml as e, readableTime } from '../lib/format.js';
import { manilaClock, timeLabel, classInProgress, todayWindow, windowIsOpen, scheduleSort } from '../lib/schedule.js';
import { buildMeetingReport, summarizeMeetingReport } from '../lib/report.js';
import { icon } from '../lib/icons.js';

const sectionCode = (id, data) => data.sections.find((s) => Number(s.id) === Number(id))?.code || '—';
const subjectCode = (id, data) => data.subjects.find((s) => Number(s.id) === Number(id))?.code || '—';
const isoDate = (d) => d.toISOString().slice(0,10);
const fromIso = (d) => new Date(`${d}T00:00:00.000Z`);
const dateOffset = (d,n) => { const out=fromIso(d); out.setUTCDate(out.getUTCDate()+n); return isoDate(out); };
const dayDifference = (a,b) => Math.round((fromIso(a)-fromIso(b))/86400000);

// Chart numbers are built from real opened class windows, matching the current
// approved roster (not historical enrollment snapshots). Never use fabricated data.
export function attendanceTrend(data, endDate, range = 7) {
  const days = [7,30,90].includes(Number(range)) ? Number(range) : 7;
  const firstDate = dateOffset(endDate, 1-days);
  const bucketSpan = days===7?1:days===30?5:15;
  const bucketCount = Math.ceil(days/bucketSpan);
  const buckets = Array.from({length:bucketCount},(_,i)=>{
    const start = dateOffset(firstDate,i*bucketSpan);
    const end = dateOffset(firstDate,Math.min(days-1,(i+1)*bucketSpan-1));
    return {start,end,expected:0,present:0};
  });
  const schedules = new Map(data.schedules.map(s=>[Number(s.id),s]));
  const studentsBySection = new Map();
  for (const p of data.profiles) {
    if (!p.is_approved) continue;
    const key = Number(p.section_id);
    if (!studentsBySection.has(key)) studentsBySection.set(key,new Set());
    studentsBySection.get(key).add(String(p.user_id));
  }
  const attendanceByWindow = new Map();
  for (const a of data.attendance) {
    if (a.attendance_window_id==null) continue;
    const id = Number(a.attendance_window_id);
    if (!attendanceByWindow.has(id)) attendanceByWindow.set(id,new Set());
    attendanceByWindow.get(id).add(String(a.student_id));
  }
  for (const w of data.windows) {
    if (!w.opened_at || w.meeting_date<firstDate || w.meeting_date>endDate) continue;
    const schedule=schedules.get(Number(w.schedule_id));
    if (!schedule) continue;
    const students=studentsBySection.get(Number(schedule.section_id));
    if (!students || students.size===0) continue;
    const index=Math.floor(dayDifference(w.meeting_date,firstDate)/bucketSpan);
    const b=buckets[index];
    if (!b) continue;
    b.expected+=students.size;
    const actual=attendanceByWindow.get(Number(w.id)) || new Set();
    for (const studentId of actual) if (students.has(studentId)) b.present++;
  }
  return buckets.map((b)=>({
    ...b,
    rate: b.expected ? Math.round(1000*b.present/b.expected)/10 : null,
    label: days===7 ? new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'UTC'}).format(fromIso(b.start))
      : `${Number(b.start.slice(5,7))}/${Number(b.start.slice(8,10))}`,
  }));
}

export function renderAttendanceChart(buckets) {
  const width = 750, height=285, left=44, right=16, top=23, bottom=43;
  const plotW=width-left-right, plotH=height-top-bottom;
  const step=plotW/Math.max(1,buckets.length);
  const grid=[0,25,50,75,100].map(y=>{
    const py=top+plotH*(1-y/100);
    return `<g><line x1="${left}" x2="${width-right}" y1="${py}" y2="${py}" stroke="var(--chart-grid)" stroke-width="1"/><text x="${left-12}" y="${py+4}" text-anchor="end" fill="var(--text-soft)" font-size="12">${y}%</text></g>`;
  }).join('');
  const columns=buckets.map((b,i)=>{
    const rate=b.rate || 0;
    const x=left+step*i+step/2;
    const barWidth=Math.min(52,step*.63);
    const y=top+plotH*(1-rate/100);
    return `<g><title>${e(b.start)} to ${e(b.end)}: ${b.expected ? `${b.present}/${b.expected} (${b.rate}%)` : 'No opened class windows'}</title>
      <rect x="${x-barWidth/2}" y="${y}" width="${barWidth}" height="${Math.max(0,top+plotH-y)}" rx="9" fill="url(#attBars)" opacity="${b.expected?'0.96':'0.15'}"/>
      <text x="${x}" y="${height-13}" text-anchor="middle" fill="var(--text-soft)" font-size="12">${e(b.label)}</text></g>`;
  }).join('');
  // Isolated data points are not joined across buckets with no attendance windows.
  const dots=buckets.map((b,i)=>b.rate===null?null:{x:left+step*i+step/2,y:top+plotH*(1-b.rate/100),rate:b.rate,expected:b.expected,present:b.present});
  const segments=[]; let segment=[];
  for (const point of [...dots,null]) {
    if (!point) { if (segment.length>1) segments.push(`<polyline points="${segment.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="#78ebcd" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`); segment=[]; }
    else segment.push(point);
  }
  const markers=dots.filter(Boolean).map(p=>`<g><title>${p.present} of ${p.expected} checked in — ${p.rate}%</title><circle cx="${p.x}" cy="${p.y}" r="6.5" fill="#68e7c3" stroke="#062535" stroke-width="3"/><circle cx="${p.x}" cy="${p.y}" r="2" fill="white"/></g>`).join('');
  return `<svg class="attendance-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Attendance rates calculated from opened class windows, with gaps when no class data is available">
    <defs><linearGradient id="attBars" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#50e5bf" stop-opacity=".88"/><stop offset="1" stop-color="#127b78" stop-opacity=".1"/></linearGradient></defs>
    ${grid}${columns}${segments.join('')}${markers}</svg>`;
}

const stat = (label,value,hint,name,tone='mint') => `<div class="stat-card stat-${tone}"><div class="stat-icon">${icon(name,26)}</div><div class="stat-content"><p class="stat-label">${e(label)}</p><p class="stat-value">${e(value)}</p><p class="stat-hint">${e(hint)}</p></div></div>`;
const sectionStatus = (s,data,clock) => {
  const w=todayWindow(s,data.windows,clock);
  if (classInProgress(s,clock) && windowIsOpen(w)) return {label:'Open',tone:'good'};
  if (w && (w.opened_at || w.is_open)) return {label:'Closed',tone:'quiet'};
  if (classInProgress(s,clock)) return {label:'Ready',tone:'warn'};
  return {label:'Scheduled',tone:'neutral'};
};
const initials = (p) => `${(p.first_name||'?').slice(0,1)}${(p.surname||'?').slice(0,1)}`.toUpperCase();
const studentName = (p) => `${p.first_name || ''} ${p.surname || ''}`.trim();

export function renderAdminDashboard(context,data,range=7) {
  const clock=manilaClock();
  const approved=data.profiles.filter(p=>p.is_approved);
  const pending=data.profiles.filter(p=>!p.is_approved);
  const todays=[...data.schedules].filter(s=>Number(s.weekday)===clock.weekday).sort(scheduleSort);
  const open=todays.filter(s=>sectionStatus(s,data,clock).label==='Open').length;
  const rows=buildMeetingReport(data,{date:clock.date});
  const today=summarizeMeetingReport(rows);
  const buckets=attendanceTrend(data,clock.date,range);
  const sum=buckets.reduce((acc,b)=>({expected:acc.expected+b.expected,present:acc.present+b.present}),{expected:0,present:0});
  const rate=sum.expected?`${Math.round(1000*sum.present/sum.expected)/10}%`:'—';
  const classCards=todays.slice(0,6).map(s=>{
    const status=sectionStatus(s,data,clock);
    return `<a class="class-tile" href="#/admin/classes" title="Manage Section ${e(sectionCode(s.section_id,data))} attendance"><div class="class-top"><span class="class-section">${icon('graduation',19)} ${e(sectionCode(s.section_id,data))}</span><span class="status-chip ${status.tone}">${status.label}</span></div><div class="class-subject">${e(subjectCode(s.subject_id,data))}</div><div class="class-time">${icon('clock',14)} ${e(timeLabel(s.start_time))} – ${e(timeLabel(s.end_time))}</div></a>`;
  }).join('');
  const mostRecent=[...data.profiles].sort((a,b)=>Number(a.is_approved)-Number(b.is_approved) || a.surname.localeCompare(b.surname)).slice(0,6);
  const todayWindows=data.windows.filter(w=>w.meeting_date===clock.date && Boolean(w.opened_at));
  const scheduleById=new Map(data.schedules.map(s=>[Number(s.id),s]));
  const checkins=new Set(data.attendance.filter(a=>a.attendance_window_id!=null).map(a=>`${a.attendance_window_id}:${a.student_id}`));
  const studentRows=mostRecent.map((p,i)=>{
    const eligible=todayWindows.filter(w=>Number(scheduleById.get(Number(w.schedule_id))?.section_id)===Number(p.section_id));
    const checked=eligible.filter(w=>checkins.has(`${w.id}:${p.user_id}`)).length;
    const attendance = !p.is_approved ? '<span class="status-chip warn">Pending approval</span>' :
      !eligible.length ? '<span class="status-chip neutral">No session today</span>' :
      `<span class="status-chip ${checked===eligible.length?'good':checked>0?'warn':'neutral'}">${e(`${checked}/${eligible.length} check-ins`)}</span>`;
    return `<tr><td><div class="student-identity"><span class="mini-avatar av-${i%4}">${e(initials(p))}</span><span class="identity-text"><strong>${e(studentName(p))}</strong><small>@${e(p.github_username)}</small></span></div></td><td>${e(sectionCode(p.section_id,data))}</td><td>${e(subjectCode(p.subject_id,data))}</td><td><span class="status-chip ${p.is_approved?'good':'warn'}">${p.is_approved?'Approved':'Pending'}</span></td><td>${attendance}</td><td><a class="tiny-link" href="#/admin/students" aria-label="Manage ${e(studentName(p))}">${icon('arrow',16)}</a></td></tr>`;
  }).join('');
  const actions=(data.audit||[]).slice(0,5).map((log,index)=>{
    const action=String(log.action||'Activity').replace(/[._-]/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
    const subject=data.profiles.find(p=>p.user_id===log.subject_user_id);
    const caption=subject ? studentName(subject) : 'System event';
    return `<li class="activity-entry"><div class="timeline-bubble ${index%2?'blue':''}">${icon(log.action?.includes('student')?'users':log.action?.includes('attendance')?'calendar':'activity',19)}</div><div class="timeline-content"><strong>${e(action)}</strong><small>${e(caption)}</small></div><time>${e(readableTime(log.created_at))}</time></li>`;
  }).join('');
  const missingData=!sum.expected;
  return `<div class="admin-overview">
    <div class="dashboard-intro"><div><span class="page-eyebrow">ADMIN OVERVIEW <span class="eyebrow-dot"></span> ${e(clock.date)} · PH time</span><h1>Welcome back, Admin <span aria-hidden="true">👋</span></h1><p>Here’s what’s happening in your classes today.</p></div>
      <div class="quick-actions"><span class="quick-label">${icon('bolt',16)} Quick actions</span><a href="#/admin/classes" class="primary">${icon('calendar',17)} Open attendance</a><a data-filter-pending="true" href="#/admin/students" class="secondary">${icon('userplus',17)} Approve students ${pending.length?`(${pending.length})`:''}</a><a href="#/admin/reports" class="secondary">${icon('download',17)} Export report</a></div></div>
    <section class="stats-grid" aria-label="Live school statistics">
      ${stat('Approved students',approved.length,'Approved student profiles','users')}
      ${stat('Check-ins today',today.present,`${today.expected} expected for opened sessions`,'check','green')}
      ${stat('Open attendance',open,`${todays.length} classes scheduled today`,'calendar','gold')}
      ${stat('Pending approvals',pending.length,'Profiles waiting for review','clock','rose')}
    </section>
    <div class="analytics-grid"><section class="glass-card analytics-card" aria-label="Attendance analytics"><div class="card-heading"><div class="card-heading-text"><span class="heading-icon">${icon('chart',20)}</span><div><h2>Attendance analytics</h2><p>Recorded check-ins across opened class sessions.</p></div></div>
      <div class="range-tabs" role="group" aria-label="Chart time range">${[7,30,90].map(days=>`<button type="button" data-chart-range="${days}" class="${Number(range)===days?'selected':''}" aria-pressed="${Number(range)===days}">${days===90?'90D':`${days}D`}</button>`).join('')}</div></div>
      <div class="chart-content"><div class="chart-visual">${renderAttendanceChart(buckets)}${missingData?'<p class="chart-empty-note">No opened meetings in this period yet. The chart will populate as attendance is recorded.</p>':''}</div><div class="chart-summary"><div><span class="summary-kicker">Attendance rate</span><strong>${e(rate)}</strong><small>${e(`${sum.present} of ${sum.expected} expected check-ins`)}</small></div><div><span class="summary-kicker">Recorded check-ins</span><strong>${sum.present}</strong></div><div><span class="summary-kicker">Not checked in</span><strong>${Math.max(0,sum.expected-sum.present)}</strong><small>Does not imply unexcused absence</small></div></div></div></section>
      <section class="glass-card class-card" aria-label="Today's class windows"><div class="card-heading"><div class="card-heading-text"><span class="heading-icon">${icon('calendar',20)}</span><div><h2>Today's class windows</h2><p>${todays.length} classes scheduled on this weekday.</p></div></div><a href="#/admin/classes" class="card-link">View all ${icon('arrow',16)}</a></div>
      <div class="class-tiles">${classCards || '<div class="empty-card">No classes are scheduled today. Open Classes to see the full weekly timetable.</div>'}</div></section></div>
    <div class="lower-grid"><section class="glass-card student-card" aria-label="Student management preview"><div class="card-heading"><div class="card-heading-text"><span class="heading-icon">${icon('users',20)}</span><div><h2>Student management</h2><p>Recent profiles and class attendance.</p></div></div><a href="#/admin/students" class="outline-action">Manage students ${icon('arrow',16)}</a></div>
    <div class="modern-table-wrap"><table class="modern-table"><thead><tr><th>Student</th><th>Section</th><th>Subject</th><th>Profile</th><th>Attendance today</th><th><span class="sr-only">Action</span></th></tr></thead><tbody>${studentRows||'<tr><td colspan="6" class="empty-row">No students have submitted profiles yet.</td></tr>'}</tbody></table></div><div class="card-footer">Showing up to 6 profiles · <a href="#/admin/students">View all students ${icon('arrow',14)}</a></div></section>
    <section class="glass-card activity-card" aria-label="Recent activity"><div class="card-heading"><div class="card-heading-text"><span class="heading-icon">${icon('activity',20)}</span><div><h2>Recent activity</h2><p>Latest recorded system actions.</p></div></div><a href="#/admin/audit" class="card-link">View log ${icon('arrow',16)}</a></div><ol class="activity-list">${actions||'<li class="empty-card">No recorded activity yet.</li>'}</ol></section></div>
    <p class="report-footnote">${icon('info',14)} Attendance percentages use currently approved students in opened class windows. Historical enrollment changes may affect retrospective figures.</p>
    <span class="sr-only">Class timetable and attendance controls</span>
  </div>`;
}
