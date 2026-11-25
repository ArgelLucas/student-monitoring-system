import { escapeHtml as e, formError, readableTime } from '../lib/format.js';
import { manilaClock, timeLabel, weekdayLabel, classInProgress, todayWindow, windowIsOpen, scheduleSort } from '../lib/schedule.js';
import { buildMeetingReport, summarizeMeetingReport } from '../lib/report.js';
import { studentAttendanceSummary } from '../lib/attendance-views.js';
import { icon } from '../lib/icons.js';
import { renderAdminDashboard } from './admin-dashboard.js';

const card = 'panel p-5 sm:p-7';
const pill = (approved) => approved
  ? '<span class="inline-flex rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200">Approved</span>'
  : '<span class="inline-flex rounded-full bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-200">Pending</span>';
const adminLinks = [
  ['/admin', 'Overview','home'],
  ['/admin/students', 'Students','users'],
  ['/admin/attendance', 'Attendance','calendar'],
  ['/admin/classes', 'Classes','book'],
  ['/admin/reports', 'Reports','chart'],
  ['/admin/audit', 'Activity log','activity'],
];

const sectionName = (id, data) => data.sections.find((s) => Number(s.id) === Number(id))?.code || 'Unknown';
const subjectName = (id, data) => data.subjects.find((s) => Number(s.id) === Number(id))?.code || 'Unknown';
const classTime = (s) => `${timeLabel(s.start_time)} – ${timeLabel(s.end_time)}`;
const isCheckedIn = (s, w, data) => Boolean(w && data.attendance.some((a) => Number(a.attendance_window_id) === Number(w.id)));
const tableEmpty = (columns, message) => `<tr><td colspan="${columns}" class="py-6 text-muted">${e(message)}</td></tr>`;
const tile = (name, number, note) => `<div class="${card}"><p class="text-sm text-muted">${e(name)}</p><p class="metric mt-3 text-3xl font-extrabold">${e(number)}</p><p class="mt-2 text-xs leading-5 text-muted">${e(note)}</p></div>`;
const titleBlock = (eyebrow, title, subtitle) => `<div class="mb-8"><p class="mb-2 text-xs font-extrabold uppercase tracking-[.22em] text-brand">${e(eyebrow)}</p><h1 class="text-3xl font-extrabold tracking-tight sm:text-4xl">${e(title)}</h1>${subtitle ? `<p class="mt-3 max-w-3xl text-sm leading-6 text-muted">${e(subtitle)}</p>` : ''}</div>`;

function adminShell(content, context) {
  const current = locationHash() || '/admin';
  const pending = Number(context?.adminMeta?.pending || 0);
  const links = adminLinks.map(([href,label,name]) => `<a class="sidebar-link ${current===href?'is-active':''}" href="#${href}" ${current===href?'aria-current="page"':''}>${icon(name,20)}<span>${e(label)}</span></a>`).join('');
  return `<div class="admin-app-shell">
    <a href="#admin-content" class="skip-link">Skip to content</a>
    <div id="sidebar-backdrop" class="sidebar-backdrop" aria-hidden="true"></div>
    <aside id="admin-sidebar" class="admin-sidebar" aria-label="Admin navigation">
      <div class="sidebar-brand"><a href="#/admin" class="brandmark" aria-label="StudentMonitor dashboard"><span class="logo-square">SM</span><strong>StudentMonitor<span>.</span></strong></a><button id="sidebar-close" class="mobile-close icon-button" type="button" aria-label="Close navigation">${icon('x',20)}</button></div>
      <div class="sidebar-middle"><p class="sidebar-caption">ADMIN PORTAL</p><nav aria-label="Admin pages">${links}</nav><div class="sidebar-divider"></div><p class="sidebar-caption sidebar-subtitle">YOUR WORKSPACE</p><a class="sidebar-link" href="#/admin/classes">${icon('calendar',20)}<span>Attendance controls</span></a><a class="sidebar-link" href="#/admin/reports">${icon('download',20)}<span>Export records</span></a></div>
      <div class="school-illustration" aria-hidden="true"><svg viewBox="0 0 250 135" fill="none"><defs><linearGradient id="schoolLight" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#42eac9"/><stop offset="1" stop-color="#09606c"/></linearGradient></defs><circle cx="42" cy="109" r="30" fill="#176b73" opacity=".38"/><circle cx="208" cy="100" r="38" fill="#176b73" opacity=".3"/><path d="M30 118h190" stroke="#286e78" stroke-width="2"/><path d="M55 83h140v35H55z" fill="#0d5264" stroke="#48c5b3" stroke-width="2"/><path d="m42 82 83-49 82 49" stroke="url(#schoolLight)" stroke-width="5" stroke-linecap="round"/><path d="M82 99h15v19H82zm34-1h20v20h-20zm32 1h15v19h-15z" fill="#35baa8" opacity=".45"/><path d="M125 34V6m0 0 27 7-27 7" stroke="#59e7bf" stroke-width="3" stroke-linejoin="round"/><circle cx="125" cy="72" r="8" fill="#46dcba" opacity=".45"/><circle cx="24" cy="108" r="16" fill="#1ba993" opacity=".36"/><circle cx="224" cy="108" r="19" fill="#13a58e" opacity=".28"/></svg></div>
      <div class="sidebar-bottom"><strong>Student Monitoring System</strong><p>Attendance · Students · Classes</p><span class="sidebar-accent"></span></div>
    </aside>
    <div class="admin-workspace">
      <header class="admin-topbar"><div class="topbar-left"><button id="sidebar-toggle" type="button" class="icon-button mobile-menu" aria-label="Open navigation" aria-controls="admin-sidebar" aria-expanded="false">${icon('menu',22)}</button><span class="topbar-breadcrumb">Workspace <span class="separator">/</span> <strong>${e(adminLinks.find(([href])=>href===current)?.[1]||'Overview')}</strong></span></div>
      <div class="topbar-actions"><form id="global-search-form" role="search" class="global-search">${icon('search',19)}<input id="global-search" type="search" autocomplete="off" placeholder="Search students or GitHub…" aria-label="Search student profiles"/><kbd>Ctrl K</kbd></form>
        <a href="#/admin/students" data-filter-pending="true" class="icon-button notifications" aria-label="${e(pending)} pending student approvals" title="Pending student approvals">${icon('bell',21)}${pending?`<span class="notification-badge">${pending>99?'99+':pending}</span>`:''}</a>
        <span class="topbar-rule"></span><div class="admin-user"><span class="admin-avatar">A</span><span class="admin-user-name">Admin<small>Administrator</small></span></div>
        <button id="logout-button" class="icon-button" type="button" title="Log out" aria-label="Log out">${icon('logout',21)}</button></div></header>
      ${context?.adminMeta?.warnings?.length ? `<div class="schema-warning" role="status">${icon('info',19)}<p>${context.adminMeta.warnings.map(e).join(' ')}</p></div>` : ''}
      <main id="admin-content" class="admin-main">${content}</main>
      <footer class="admin-footer">StudentMonitor v4 <span>·</span> Class times use Asia/Manila <span>·</span> Supabase access control</footer>
    </div>
  </div>`;
}

export function shell(content, context = null) {
  if (context?.admin) return adminShell(content, context);
  const approved = context?.profile?.is_approved;
  const links = !context ? '' : approved ? '<a class="secondary text-xs sm:text-sm" href="#/student">Home</a><a class="secondary text-xs sm:text-sm" href="#/attendance">Attendance</a><a class="secondary text-xs sm:text-sm" href="#/profile">My profile</a>'
      : '<a class="secondary text-xs sm:text-sm" href="#/profile">Student information</a>';
  const name = context?.profile?.first_name || 'Student';
  return `<div class="min-h-screen bg-[radial-gradient(ellipse_at_top_right,_#194452_0%,_#071321_62%)]">
    <header class="sticky top-0 z-20 border-b border-slate-700/70 bg-[#081a2b]/95 backdrop-blur-lg">
      <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <a href="#/" class="flex items-center gap-3 text-lg font-black tracking-tight text-white">
          <span class="grid h-10 w-10 place-items-center rounded-xl bg-brand text-deep">SM</span>
          <span>StudentMonitor<span class="text-brand">.</span></span></a>
        <nav aria-label="Main navigation" class="flex flex-wrap items-center gap-2">${links}</nav>
        ${context ? `<div class="flex items-center gap-2"><span class="hidden text-xs text-muted sm:inline">${e(name)}</span><button id="logout-button" class="secondary text-xs sm:text-sm" type="button">Log out</button></div>` : ''}
      </div>
    </header>
    <main class="mx-auto min-h-[75vh] max-w-7xl px-4 pb-16 pt-10 sm:px-6">${content}</main>
    <footer class="mx-auto max-w-7xl border-t border-slate-700/60 px-4 py-7 text-xs text-muted sm:px-6">StudentMonitor v4 • Class dates and times use Asia/Manila • Access is enforced by Supabase</footer>
  </div>`;
}
function locationHash() { return typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''; }

export function loginScreen(message = '') {
  return shell(`<div class="grid items-center gap-12 py-10 lg:grid-cols-2 lg:py-20">
    <section><span class="rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-brand">Student & instructor portal</span>
      <h1 class="mt-7 max-w-xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">One place for <span class="text-brand">every class.</span></h1>
      <p class="mt-6 max-w-lg text-lg leading-8 text-muted">Verify your student profile, follow your class timetable, and check in when your instructor opens attendance.</p>
      <div class="mt-8 flex flex-wrap gap-2 text-sm"><span class="rounded-xl border border-slate-700 px-3 py-2">GitHub sign-in</span><span class="rounded-xl border border-slate-700 px-3 py-2">Approval required</span><span class="rounded-xl border border-slate-700 px-3 py-2">Philippine class time</span></div>
    </section>
    <section class="${card} mx-auto w-full max-w-md" aria-label="Sign in">
      <div class="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-brand text-2xl font-black text-deep">G</div>
      <h2 class="text-2xl font-bold">Continue with GitHub</h2><p class="mb-6 mt-2 text-sm leading-6 text-muted">Sign in using the GitHub account you registered for class. Never enter your GitHub password on this website.</p>
      ${message ? `<div class="mb-4">${formError(message)}</div>` : ''}
      <button id="github-login" class="primary w-full" type="button">Sign in with GitHub →</button>
      <p class="mt-6 text-xs leading-5 text-muted">New students fill out their profile before receiving attendance access. Your instructor approves the profile.</p>
    </section></div>`);
}
function selectField(name, title, list, selected, valueFn = (item) => item.id, labelFn = (item) => item.code) {
  return `<label><span class="label">${e(title)} <span class="text-brand">*</span></span><select class="field" name="${e(name)}" required><option value="">Select ${e(title.toLowerCase())}</option>${list.map((item) => `<option value="${e(valueFn(item))}" ${String(valueFn(item)) === String(selected ?? '') ? 'selected' : ''}>${e(labelFn(item))}</option>`).join('')}</select></label>`;
}
export function profileScreen(profile, catalog, verifiedGitHub, message = '') {
  const input = (name, label, value = '', extra = '') => `<label><span class="label">${e(label)} <span class="text-brand">*</span></span><input class="field" name="${e(name)}" value="${e(value ?? '')}" ${extra} required /></label>`;
  const approved = Boolean(profile?.is_approved);
  return shell(`${titleBlock('Student onboarding', approved ? 'Your student profile' : 'Complete your information', approved
    ? 'Keep your personal details accurate. Ask your instructor to change an approved class assignment.'
    : 'All fields must be completed before access can be requested. Your instructor must then approve your profile.')}
    <section class="${card} max-w-3xl"><div id="form-message" class="mb-4">${message ? formError(message) : ''}</div>
      <form id="profile-form" class="space-y-5"><div class="grid gap-5 sm:grid-cols-2">
        ${input('surname','Surname',profile?.surname,'maxlength="80" autocomplete="family-name"')}
        ${input('first_name','First name',profile?.first_name,'maxlength="80" autocomplete="given-name"')}
        ${input('middle_initial','Middle initial (N/A if none)',profile?.middle_initial,'maxlength="3" placeholder="A or N/A"')}
        ${selectField('sex','Sex',[{id:'Male',code:'Male'},{id:'Female',code:'Female'},{id:'Prefer not to say',code:'Prefer not to say'}],profile?.sex)}
        ${input('age','Age',profile?.age,'type="number" min="12" max="99" inputmode="numeric"')}
        ${selectField('section_id','Section',catalog.sections,profile?.section_id)}
        ${selectField('subject_id','Primary subject',catalog.subjects,profile?.subject_id)}
        ${input('github_username','Verified GitHub username',profile?.github_username || verifiedGitHub,'maxlength="100" spellcheck="false"')}
      </div>
      <div class="rounded-xl border border-sky-500/30 bg-sky-400/10 p-4 text-sm leading-6 text-sky-100">Subjects are filtered to your chosen section. Your GitHub username must match the GitHub account you used to sign in. Every scheduled subject for your section will appear in your timetable.</div>
      <div class="flex flex-wrap items-center gap-3"><button type="submit" class="primary">Save student information</button>${approved ? '<a class="secondary" href="#/student">Back to home</a>' : ''}</div>
      </form></section>`, { admin: false, profile });
}
export function pendingScreen(profile) {
  return shell(`<div class="${card} mx-auto max-w-2xl py-10 text-center"><div class="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-amber-300/10 text-3xl">⏳</div>
    <h1 class="text-3xl font-bold">Waiting for approval</h1><p class="mt-4 leading-7 text-muted">Thanks, ${e(profile.first_name)}. Your form is saved, but your instructor must approve it before you can view your classes or mark attendance.</p>
    <div class="my-6">${pill(false)}</div><div class="flex flex-wrap justify-center gap-3"><a href="#/profile" class="secondary">Review profile</a><button id="refresh-status" class="primary" type="button">Check approval status</button></div></div>`, { admin:false, profile });
}

export function studentScreen(context, data) {
  const p = context.profile;
  const now = manilaClock();
  const todays = data.schedules.filter((s) => Number(s.weekday) === now.weekday);
  const checked = todays.filter((s) => isCheckedIn(s, todayWindow(s, data.windows, now), data)).length;
  const summary = studentAttendanceSummary(data.attendance, data.windows);
  const weekly = [...data.schedules].sort(scheduleSort).map((s) => `<tr class="border-t border-slate-700/60"><td class="py-3">${e(weekdayLabel(s.weekday))}</td><td class="py-3 font-semibold">${e(subjectName(s.subject_id,data))}</td><td class="py-3">${e(classTime(s))}</td></tr>`).join('');
  const upcoming = todays.map((s) => {
    const win = todayWindow(s, data.windows, now);
    const present = isCheckedIn(s, win, data);
    const active = classInProgress(s, now) && windowIsOpen(win);
    const status = present ? 'Recorded' : active ? 'Check-in open' : 'Not open';
    return `<div class="rounded-xl border border-slate-700/70 bg-[#0a2034] p-4"><p class="text-xs text-muted">${e(classTime(s))}</p><div class="mt-2 flex items-center justify-between gap-3"><strong>${e(subjectName(s.subject_id,data))}</strong><span class="text-xs ${active ? 'status-ok':'status-warning'}">${e(status)}</span></div></div>`;
  }).join('');
  return shell(`${titleBlock('Student dashboard', `Welcome back, ${p.first_name}!`, `Section ${sectionName(p.section_id,data)} • ${now.date} • Philippine time`)}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">${tile('Your status','Approved','Profile verified by your instructor')}${tile('Classes today',todays.length,'Scheduled meetings')}${tile('Check-ins today',`${checked} / ${todays.length}`,'Only instructor-opened meetings count')}${tile('Recent check-ins',summary.recentCheckins,'Latest 250 records are shown')}</div>
    <div class="mt-6 grid gap-5 lg:grid-cols-5"><section class="${card} lg:col-span-3"><div class="mb-5 flex flex-wrap items-center justify-between gap-4"><div><h2 class="text-xl font-bold">Today’s classes</h2><p class="mt-1 text-sm text-muted">Your section’s scheduled meetings</p></div><a class="primary" href="#/attendance">Check attendance →</a></div>
      <div class="grid gap-3 sm:grid-cols-2">${upcoming || '<p class="text-sm text-muted">No class scheduled today.</p>'}</div></section>
      <section class="${card} lg:col-span-2"><h2 class="text-xl font-bold">Student information</h2><p class="mt-4 text-sm text-muted">${e(p.surname)}, ${e(p.first_name)} ${e(p.middle_initial)}</p><p class="mt-2 text-sm text-muted">Section ${e(sectionName(p.section_id,data))} • ${e(subjectName(p.subject_id,data))}</p>
        <p class="mt-2 text-sm text-muted">GitHub: <a class="text-brand underline" rel="noopener noreferrer" target="_blank" href="https://github.com/${encodeURIComponent(p.github_username)}">@${e(p.github_username)}</a></p><a class="secondary mt-5" href="#/profile">Update personal details</a></section></div>
    <section class="${card} mt-6"><h2 class="mb-2 text-xl font-bold">Your weekly timetable</h2><p class="mb-5 text-sm text-muted">All times are in Asia/Manila.</p><div class="overflow-x-auto"><table class="w-full min-w-[380px] text-left text-sm"><thead class="text-muted"><tr><th class="pb-3">Day</th><th class="pb-3">Subject</th><th class="pb-3">Class time</th></tr></thead><tbody>${weekly || tableEmpty(3,'No classes assigned.')}</tbody></table></div></section>`,context);
}

export function attendanceScreen(context, data, message = '') {
  const clock = manilaClock();
  const todays = data.schedules.filter((s) => Number(s.weekday) === clock.weekday).sort(scheduleSort);
  const cards = todays.map((s) => {
    const win = todayWindow(s, data.windows, clock);
    const present = isCheckedIn(s, win, data);
    const open = windowIsOpen(win) && classInProgress(s,clock);
    const state = present ? 'Attendance recorded' : open ? 'Attendance open' : 'Not open';
    const action = present ? '<button class="secondary" disabled>Check-in recorded ✓</button>' : open
      ? `<button class="primary" type="button" data-attendance-checkin="true" data-schedule-id="${e(s.id)}">Mark me present →</button>`
      : '<p class="text-sm text-muted">Your instructor must open attendance during this scheduled class.</p>';
    return `<section class="${card}"><p class="text-sm text-muted">${e(sectionName(s.section_id,data))} • ${e(classTime(s))}</p><h2 class="mt-2 text-2xl font-bold">${e(subjectName(s.subject_id,data))}</h2><p class="mt-3 font-semibold ${present || open ? 'status-ok':'status-warning'}">${e(state)}</p><div class="mt-5">${action}</div></section>`;
  }).join('');
  const history = data.attendance.map((r) => `<tr class="border-t border-slate-700/60"><td class="py-3">${e(r.attendance_date)}</td><td class="py-3">${e(subjectName(r.subject_id,data))}</td><td class="py-3 status-ok">${e(r.status)}</td><td class="py-3">${e(readableTime(r.marked_at))}</td></tr>`).join('');
  return shell(`${titleBlock('Student attendance','Your class check-ins',`${weekdayLabel(clock.weekday)}, ${clock.date} • The server validates your class time, section and instructor’s open window.`)}
    <div class="mb-5 flex flex-wrap items-center gap-3"><button id="refresh-status" type="button" class="secondary">Refresh attendance status</button><a class="secondary" href="#/student">Back to home</a></div>
    <div id="attendance-message" class="mb-4">${message ? formError(message) : ''}</div>
    <div class="grid gap-4 md:grid-cols-2">${cards || `<div class="${card}"><h2 class="text-xl font-bold">No classes today</h2><p class="mt-3 text-muted">Check your weekly timetable on the student home page.</p></div>`}</div>
    <section class="${card} mt-6"><h2 class="mb-5 text-xl font-bold">Your recent check-ins</h2><div class="overflow-x-auto"><table class="w-full min-w-[600px] text-left text-sm"><thead class="text-muted"><tr><th class="pb-3">Date</th><th class="pb-3">Subject</th><th class="pb-3">Status</th><th class="pb-3">Recorded at</th></tr></thead><tbody>${history || tableEmpty(4,'No check-ins recorded yet.')}</tbody></table></div></section>`,context);
}

export function adminScreen(context, data, range = 7) {
  return shell(renderAdminDashboard(context, data, range), context);
}

export function adminStudentsScreen(context,data) {
  const pending = data.profiles.filter((p) => !p.is_approved).length;
  const rows = [...data.profiles].sort((a,b) => Number(a.is_approved)-Number(b.is_approved) || a.surname.localeCompare(b.surname)).map((p) => {
    const name = `${p.surname}, ${p.first_name} ${p.middle_initial}`;
    const subjects = data.sectionSubjects.filter((s) => Number(s.section_id) === Number(p.section_id))
      .map((s) => data.subjects.find((subject) => Number(subject.id) === Number(s.subject_id))).filter(Boolean);
    const assignForm = `<details class="mt-2"><summary class="cursor-pointer text-xs text-brand underline">Edit class assignment</summary><form class="assignment-form mt-3 flex flex-wrap items-end gap-2" data-user-id="${e(p.user_id)}"><label><span class="label">Section</span><select class="field min-w-[100px]" name="section_id" required>${data.sections.map((s) => `<option value="${e(s.id)}" ${Number(s.id) === Number(p.section_id)?'selected':''}>${e(s.code)}</option>`).join('')}</select></label><label><span class="label">Primary subject</span><select class="field min-w-[130px]" name="subject_id" required>${data.subjects.map((s) => `<option value="${e(s.id)}" ${Number(s.id) === Number(p.subject_id)?'selected':''}>${e(s.code)}</option>`).join('')}</select></label><button class="primary text-xs" type="submit">Save assignment</button></form></details>`;
    return `<tr class="student-row border-t border-slate-700/60" data-search="${e(`${name} ${p.github_username}`.toLowerCase())}" data-section="${e(p.section_id)}" data-approval-state="${p.is_approved?'approved':'pending'}">
      <td class="py-4 pr-3"><strong class="block">${e(name)}</strong><span class="text-xs text-muted">@${e(p.github_username)}</span></td><td class="py-4 pr-3">${e(sectionName(p.section_id,data))}</td><td class="py-4 pr-3">${e(subjectName(p.subject_id,data))}</td>
      <td class="py-4 pr-3">${pill(p.is_approved)}</td><td class="py-4 pr-3"><span class="text-xs text-muted">${e(p.age)} • ${e(p.sex)}</span></td>
      <td class="py-4"><button class="secondary text-xs" type="button" data-approval="${!p.is_approved}" data-user-id="${e(p.user_id)}">${p.is_approved?'Revoke approval':'Approve'}</button>${assignForm}</td>
    </tr>`;
  }).join('');
  return shell(`${titleBlock('Student management','Student profiles and approvals',`${data.profiles.length} registered profiles • ${pending} awaiting review. Only approve students you recognize.`)}
    <section class="${card}"><div class="mb-5 grid gap-3 sm:grid-cols-3"><label><span class="label">Search student or GitHub</span><input id="student-search" class="field" placeholder="Name or @username" /></label>
      <label><span class="label">Section</span><select id="student-section-filter" class="field"><option value="">All sections</option>${data.sections.map((s)=>`<option value="${e(s.id)}">${e(s.code)}</option>`).join('')}</select></label>
      <label><span class="label">Approval</span><select id="student-approval-filter" class="field"><option value="">All students</option><option value="pending">Pending</option><option value="approved">Approved</option></select></label></div>
      <div class="overflow-x-auto"><table class="w-full min-w-[850px] text-left text-sm"><thead class="text-muted"><tr><th class="pb-3">Student</th><th class="pb-3">Section</th><th class="pb-3">Primary subject</th><th class="pb-3">Status</th><th class="pb-3">Info</th><th class="pb-3">Controls</th></tr></thead><tbody>${rows || tableEmpty(6,'No students have completed profiles.')}</tbody></table></div>
      <p class="mt-5 text-xs leading-6 text-muted">For sections with multiple subjects, students can attend all scheduled subjects. Changing an assignment here is logged. Previously recorded attendance remains linked to its original class meeting.</p></section>`,context);
}

export function adminAttendanceScreen(context,data) {
  const clock=manilaClock();
  const todays=[...data.schedules].filter(s=>Number(s.weekday)===clock.weekday).sort(scheduleSort);
  const report=buildMeetingReport(data,{date:clock.date});
  const summary=summarizeMeetingReport(report);
  const classRows=todays.map(s=>{
    const win=todayWindow(s,data.windows,clock);
    const open=classInProgress(s,clock) && windowIsOpen(win);
    const roster=win?report.filter(r=>Number(r.windowId)===Number(win.id)):[];
    const present=roster.filter(r=>r.status==='Present').length;
    const status=open?'Open':win?'Closed / expired':'Not opened';
    const control=open
      ? `<button type="button" class="secondary text-xs" data-window-action="close" data-schedule-id="${e(s.id)}">Close attendance</button>`
      : `<button type="button" class="primary text-xs" data-window-action="open" data-schedule-id="${e(s.id)}" ${classInProgress(s,clock)?'':'disabled title="Available during the scheduled class only"'}>Open attendance</button>`;
    return `<tr class="border-t border-slate-700/60"><td class="py-4 font-semibold">${e(sectionName(s.section_id,data))}</td><td class="py-4">${e(subjectName(s.subject_id,data))}</td><td class="py-4">${e(classTime(s))}</td><td class="py-4 ${open?'status-ok':'status-warning'}">${e(status)}</td><td class="py-4">${present} / ${roster.length||'—'}</td><td class="py-4">${control}</td></tr>`;
  }).join('');
  const recorded=report.slice(0,100).map(r=>`<tr class="border-t border-slate-700/60"><td class="py-3 font-semibold">${e(r.student)}</td><td class="py-3">${e(r.section)}</td><td class="py-3">${e(r.subject)}</td><td class="py-3 ${r.status==='Present'?'status-ok':'status-warning'}">${e(r.status)}</td></tr>`).join('');
  return shell(`${titleBlock('Live attendance','Today’s attendance monitor',`Meeting date: ${clock.date} · Philippine time. Attendance is counted only when a scheduled window has been opened.`)}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">${tile('Scheduled classes',todays.length,'Classes scheduled today')}${tile('Opened sessions',summary.meetings,'Attendance windows for today')}${tile('Check-ins',summary.present,`${summary.expected} expected across opened windows`)}${tile('Not checked in',summary.unrecorded,'Not an automatic absence classification')}</div>
    <section class="${card} mt-6"><div class="mb-5 flex items-center justify-between gap-3"><div><h2 class="text-xl font-bold">Class attendance controls</h2><p class="text-sm text-muted">Open or close attendance only during scheduled class time.</p></div><button id="admin-refresh" type="button" class="secondary">${icon('refresh',16)} Refresh</button></div><div class="overflow-x-auto"><table class="w-full min-w-[760px] text-left text-sm"><thead class="text-muted"><tr><th class="pb-3">Section</th><th class="pb-3">Subject</th><th class="pb-3">Time</th><th class="pb-3">Window</th><th class="pb-3">Present / Expected</th><th class="pb-3">Control</th></tr></thead><tbody>${classRows||tableEmpty(6,'No classes scheduled today. Open Classes for the complete weekly timetable.')}</tbody></table></div></section>
    <section class="${card} mt-6"><div class="mb-5 flex items-center justify-between gap-4"><div><h2 class="text-xl font-bold">Today’s student check-ins</h2><p class="text-sm text-muted">Current approved roster; not checked in does not mean automatically absent.</p></div><a class="secondary" href="#/admin/reports">Reports & CSV ${icon('arrow',16)}</a></div><div class="overflow-x-auto"><table class="w-full min-w-[620px] text-left text-sm"><thead class="text-muted"><tr><th class="pb-3">Student</th><th class="pb-3">Section</th><th class="pb-3">Subject</th><th class="pb-3">Status</th></tr></thead><tbody>${recorded||tableEmpty(4,'No opened attendance windows with matching students today.')}</tbody></table></div>${report.length>100?`<p class="mt-3 text-xs text-muted">Showing 100 of ${report.length} records. Use Reports to view or export the full list.</p>`:''}</section>`,context);
}

export function adminClassesScreen(context,data) {
  const clock = manilaClock();
  const rows = [...data.schedules].sort(scheduleSort).map((s) => {
    const win = todayWindow(s,data.windows,clock);
    const time = classInProgress(s,clock);
    const open = windowIsOpen(win);
    const status = open ? 'Open' : win ? 'Closed / expired' : 'Not opened';
    const action = open
      ? `<button type="button" class="secondary text-xs" data-window-action="close" data-schedule-id="${e(s.id)}">Close attendance</button>`
      : `<button type="button" class="primary text-xs" data-window-action="open" data-schedule-id="${e(s.id)}" ${time?'':'disabled title="Available only during this class in Philippine time"'}>Open attendance</button>`;
    return `<tr class="border-t border-slate-700/60"><td class="py-4 font-semibold">${e(sectionName(s.section_id,data))}</td><td class="py-4">${e(subjectName(s.subject_id,data))}</td><td class="py-4">${e(weekdayLabel(s.weekday))}</td><td class="py-4">${e(classTime(s))}</td><td class="py-4 ${open?'status-ok':'status-warning'}">${e(status)}</td><td class="py-4">${action}</td></tr>`;
  }).join('');
  return shell(`${titleBlock('Class management','Class timetable and attendance controls',`Today: ${clock.date} • Open attendance only during a scheduled class. The database enforces the day and time using Asia/Manila.`)}
    <section class="${card}"><div class="mb-5 flex flex-wrap gap-3 items-center justify-between"><p class="text-sm text-muted">${data.schedules.length} weekly class meetings</p><button id="admin-refresh" class="secondary text-xs" type="button">Refresh classes</button></div>
      <div class="overflow-x-auto"><table class="w-full min-w-[760px] text-left text-sm"><thead class="text-muted"><tr><th class="pb-3">Section</th><th class="pb-3">Subject</th><th class="pb-3">Day</th><th class="pb-3">Time</th><th class="pb-3">Today's window</th><th class="pb-3">Admin action</th></tr></thead><tbody>${rows || tableEmpty(6,'No class meetings configured.')}</tbody></table></div>
      <p class="mt-5 text-xs leading-6 text-muted">A check-in window expires automatically at class end. Reopening a window on the same day does not allow students to check in twice.</p></section>`,context);
}

export function adminReportsScreen(context,data,filters={}) {
  const clock = manilaClock();
  const date = filters.date || clock.date;
  const sectionId = filters.sectionId || '';
  const subjectId = filters.subjectId || '';
  const rows = buildMeetingReport(data,{date,sectionId,subjectId});
  const summary = summarizeMeetingReport(rows);
  const shown = rows.slice(0,750);
  const table = shown.map((r) => `<tr class="border-t border-slate-700/60"><td class="py-3">${e(r.date)}</td><td class="py-3">${e(r.section)}</td><td class="py-3">${e(r.subject)}</td><td class="py-3 font-semibold">${e(r.student)}</td><td class="py-3 text-muted">@${e(r.github)}</td><td class="py-3 ${r.status==='Present'?'status-ok':r.status==='Open / waiting'?'status-warning':'status-quiet'}">${e(r.status)}</td></tr>`).join('');
  return shell(`${titleBlock('Attendance reports','Attendance by class meeting','Select a meeting date, section or subject, then export the roster as CSV. “Not checked in” does not automatically mean unexcused absence.')}
    <section class="${card}"><div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label><span class="label">Meeting date (Philippine)</span><input type="date" class="field" id="report-date" value="${e(date)}" /></label>
      <label><span class="label">Section</span><select class="field" id="report-section"><option value="">All sections</option>${data.sections.map((s)=>`<option value="${e(s.id)}" ${String(sectionId)===String(s.id)?'selected':''}>${e(s.code)}</option>`).join('')}</select></label>
      <label><span class="label">Subject</span><select class="field" id="report-subject"><option value="">All subjects</option>${data.subjects.map((s)=>`<option value="${e(s.id)}" ${String(subjectId)===String(s.id)?'selected':''}>${e(s.code)}</option>`).join('')}</select></label>
      <div class="flex items-end"><button id="export-report" class="primary w-full" type="button" ${rows.length?'':'disabled'}>Export CSV</button></div></div>
      <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">${tile('Opened meetings',summary.meetings,'Windows matching your filters')}${tile('Expected check-ins',summary.expected,'Current approved roster')}${tile('Present',summary.present,'Verified check-ins')}${tile('Not checked in',summary.unrecorded,`${summary.waiting} still waiting in open windows`)}</div>
      <div class="mt-6 overflow-x-auto"><table class="w-full min-w-[760px] text-left text-sm"><thead class="text-muted"><tr><th class="pb-3">Date</th><th class="pb-3">Section</th><th class="pb-3">Subject</th><th class="pb-3">Student</th><th class="pb-3">GitHub</th><th class="pb-3">Status</th></tr></thead><tbody>${table || tableEmpty(6,'No opened class windows or matching students for this date.')}</tbody></table></div>
      ${rows.length > shown.length ? `<p class="mt-3 text-xs text-amber-200">Showing the first ${shown.length} rows. CSV export includes all ${rows.length} rows.</p>` : ''}
      <p class="mt-5 text-xs leading-6 text-muted">Reports reflect the currently approved student roster, not historical enrollment snapshots. Earlier daily records without a class window remain in the attendance database but are not counted in class-meeting reports.</p></section>`,context);
}

export function adminAuditScreen(context,data) {
  const names = new Map(data.profiles.map((p)=>[p.user_id,`${p.surname}, ${p.first_name}`]));
  const rows = data.audit.map((log) => `<tr class="border-t border-slate-700/60"><td class="py-3">${e(readableTime(log.created_at))}</td><td class="py-3 font-semibold">${e(log.action)}</td><td class="py-3">${e(names.get(log.subject_user_id)||log.subject_user_id||'—')}</td><td class="py-3 text-muted">${e(log.details && Object.keys(log.details).length ? JSON.stringify(log.details) : '—')}</td></tr>`).join('');
  return shell(`${titleBlock('Security audit','Recent account activity','Read-only record of profile saves, student approvals, class windows and administrator corrections.')}
    <section class="${card}"><div class="overflow-x-auto"><table class="w-full min-w-[700px] text-left text-sm"><thead class="text-muted"><tr><th class="pb-3">Time (Philippine)</th><th class="pb-3">Action</th><th class="pb-3">Student</th><th class="pb-3">Details</th></tr></thead><tbody>${rows||tableEmpty(4,'No audit events yet.')}</tbody></table></div><p class="mt-5 text-xs text-muted">Displaying the latest 150 events.</p></section>`,context);
}

export function fatalScreen(message) { return shell(`<div class="${card} mx-auto max-w-xl"><h1 class="text-2xl font-bold">Unable to load the portal</h1><div class="mt-4">${formError(message)}</div><button id="retry-load" class="primary mt-5">Try again</button></div>`); }
export function setupScreen() { return shell(`<div class="${card} mx-auto max-w-xl"><h1 class="text-2xl font-bold">Project configuration missing</h1><p class="mt-4 leading-7 text-muted">Supabase public URL and publishable key are missing. Configure the public environment variables for this build. Never insert service_role or secret keys into the frontend.</p></div>`); }
