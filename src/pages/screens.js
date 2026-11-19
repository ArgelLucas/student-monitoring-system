import { escapeHtml as e, formError, readableTime, manilaDate } from '../lib/format.js';

const card = 'panel p-5 sm:p-7';
const pill = (approved) => approved
  ? '<span class="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">Approved</span>'
  : '<span class="rounded-full bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-200">Pending</span>';

export function shell(content, context = null) {
  const admin = context?.admin;
  const approved = context?.profile?.is_approved;
  const links = !context ? '' : admin
    ? '<a class="secondary text-sm" href="#/admin">Dashboard</a>'
    : approved
      ? '<a class="secondary text-sm" href="#/student">Home</a><a class="secondary text-sm" href="#/attendance">Attendance</a>'
      : '<a class="secondary text-sm" href="#/profile">Student information</a>';
  const userLabel = admin ? 'Administrator' : context?.profile
    ? context.profile.first_name : 'Student';
  return `
    <div class="min-h-screen bg-[radial-gradient(ellipse_at_top_right,_#173c55_0%,_#071426_56%)]">
      <header class="border-b border-slate-700/70 bg-[#091b30]/90">
        <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <a href="#/" class="flex items-center gap-3 text-lg font-bold tracking-tight text-white">
            <span class="grid h-10 w-10 place-items-center rounded-xl bg-brand text-deep">SM</span>
            <span>StudentMonitor<span class="text-brand">.</span></span>
          </a>
          <nav aria-label="Main navigation" class="flex flex-wrap items-center gap-2">
            ${links}
            ${context ? `<span class="hidden px-2 text-sm text-muted sm:inline">${e(userLabel)}</span><button id="logout-button" class="secondary text-sm" type="button">Log out</button>` : ''}
          </nav>
        </div>
      </header>
      <main class="mx-auto max-w-6xl px-5 pb-20 pt-10">${content}</main>
      <footer class="mx-auto max-w-6xl border-t border-slate-700/60 px-5 py-6 text-xs text-slate-400">
        StudentMonitor • Secure student records • Attendance dates use Philippine time
      </footer>
    </div>`;
}

export function loginScreen(message = '') {
  return shell(`
    <div class="grid items-center gap-9 py-10 lg:grid-cols-2 lg:py-24">
      <section>
        <p class="mb-4 inline-flex rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-xs font-bold uppercase tracking-[.2em] text-brand">Student portal</p>
        <h1 class="max-w-xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">Your class records, <span class="text-brand">in one place.</span></h1>
        <p class="mt-6 max-w-lg text-lg leading-8 text-muted">Sign in using your GitHub account. Complete your student profile to request access to attendance monitoring.</p>
        <div class="mt-7 flex flex-wrap gap-2 text-sm text-slate-300"><span class="rounded-xl border border-slate-700 px-3 py-2">Verified GitHub sign-in</span><span class="rounded-xl border border-slate-700 px-3 py-2">Protected student data</span></div>
      </section>
      <section class="${card} mx-auto w-full max-w-md" aria-label="Sign in">
        <div class="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-brand text-xl font-extrabold text-deep">G</div>
        <h2 class="text-2xl font-bold">Sign in with GitHub</h2>
        <p class="mt-2 mb-6 text-sm leading-6 text-muted">Use the GitHub account you created for class. Your details are verified after login.</p>
        ${message ? `<div class="mb-4">${formError(message)}</div>` : ''}
        <button id="github-login" class="primary w-full" type="button">Continue with GitHub →</button>
        <p class="mt-5 text-xs leading-5 text-muted">New students complete a required profile first. Only approved students can record attendance.</p>
      </section>
    </div>`);
}

function selectField(name, title, list, selected, valueFn = (item) => item.id, labelFn = (item) => item.code) {
  const items = list.map((item) => `<option value="${e(valueFn(item))}" ${String(valueFn(item)) === String(selected ?? '') ? 'selected' : ''}>${e(labelFn(item))}</option>`).join('');
  return `<label><span class="label">${e(title)} <span class="text-brand">*</span></span><select class="field" name="${e(name)}" required><option value="">Select ${e(title.toLowerCase())}</option>${items}</select></label>`;
}

export function profileScreen(profile, catalog, verifiedGitHub, message = '') {
  const input = (name, title, value = '', extra = '') => `<label><span class="label">${e(title)} <span class="text-brand">*</span></span><input class="field" name="${e(name)}" value="${e(value ?? '')}" ${extra} required /></label>`;
  return shell(`
    <div class="mb-8 max-w-2xl"><p class="mb-2 text-sm font-bold uppercase tracking-widest text-brand">Required onboarding</p><h1 class="text-3xl font-bold">Student information</h1><p class="mt-3 text-muted">Complete every required field. Your profile will be reviewed by the administrator before attendance access is enabled.</p></div>
    <div class="${card} max-w-3xl">
      <div id="form-message" class="mb-4">${message ? formError(message) : ''}</div>
      <form id="profile-form" class="space-y-5">
        <div class="grid gap-5 sm:grid-cols-2">
          ${input('surname', 'Surname', profile?.surname, 'minlength="1" maxlength="80" autocomplete="family-name"')}
          ${input('first_name', 'First name', profile?.first_name, 'minlength="1" maxlength="80" autocomplete="given-name"')}
          ${input('middle_initial', 'Middle initial (N/A if none)', profile?.middle_initial, 'maxlength="3" placeholder="e.g. A or N/A"')}
          ${selectField('sex', 'Sex', [{ id:'Male', code:'Male' },{ id:'Female', code:'Female' },{ id:'Prefer not to say', code:'Prefer not to say' }], profile?.sex)}
          ${input('age', 'Age', profile?.age, 'type="number" min="12" max="99" inputmode="numeric"')}
          ${selectField('section_id', 'Section', catalog.sections, profile?.section_id)}
          ${selectField('subject_id', 'Subject', catalog.subjects, profile?.subject_id, (item) => item.id, (item) => `${item.code} — ${item.name}`)}
          ${input('github_username', 'GitHub username or profile URL', profile?.github_username || verifiedGitHub, 'maxlength="100" placeholder="github-username" spellcheck="false"')}
        </div>
        <div class="rounded-xl border border-sky-500/25 bg-sky-500/10 p-4 text-sm leading-6 text-sky-100">Verified GitHub account: <strong>${e(verifiedGitHub || 'not available')}</strong>. The entered username must match this verified account. ${profile?.is_approved ? 'Contact your administrator to change an approved section or subject.' : ''}</div>
        <button class="primary" type="submit" ${!verifiedGitHub || !catalog.sections.length || !catalog.subjects.length ? 'disabled' : ''}>Save student information</button>
      </form>
    </div>`, { profile, admin: false });
}

export function pendingScreen(profile) {
  return shell(`
    <div class="${card} mx-auto max-w-2xl text-center">
      <div class="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-amber-400/15 text-3xl">⌛</div>
      <h1 class="text-3xl font-bold">Profile submitted</h1>
      <p class="mx-auto mt-4 max-w-lg leading-7 text-muted">Thanks, ${e(profile.first_name)}. Your required information is complete. An administrator must approve your profile before you can open the student landing page or mark attendance.</p>
      <div class="my-6">${pill(false)}</div>
      <div class="flex flex-wrap justify-center gap-3"><a href="#/profile" class="secondary">Review profile</a><button id="refresh-status" class="primary" type="button">Check approval status</button></div>
    </div>`, { profile, admin: false });
}

export function studentScreen(context, attendance) {
  const latest = attendance[0];
  const today = manilaDate();
  const checkedIn = attendance.some((record) => record.attendance_date === today && record.subject_id === context.profile.subject_id);
  const p = context.profile;
  return shell(`
    <div class="mb-8"><p class="mb-2 text-sm font-bold uppercase tracking-widest text-brand">Student home</p><h1 class="text-3xl font-extrabold sm:text-4xl">Welcome back, ${e(p.first_name)}.</h1><p class="mt-2 text-muted">View your class information and attendance status.</p></div>
    <div class="grid gap-4 md:grid-cols-3">
      <div class="${card}"><p class="text-sm text-muted">Profile</p><div class="mt-5">${pill(true)}</div><p class="mt-5 text-sm text-muted">GitHub: <a rel="noopener noreferrer" target="_blank" class="text-brand underline" href="https://github.com/${encodeURIComponent(p.github_username)}">@${e(p.github_username)}</a></p></div>
      <div class="${card}"><p class="text-sm text-muted">Today's attendance</p><p class="mt-4 text-2xl font-bold ${checkedIn ? 'text-brand' : 'text-amber-200'}">${checkedIn ? 'Checked in' : 'Not checked in'}</p><p class="mt-3 text-sm text-muted">${e(today)} • Asia/Manila</p></div>
      <div class="${card}"><p class="text-sm text-muted">Last check-in</p><p class="mt-4 text-lg font-semibold">${e(latest ? readableTime(latest.marked_at) : 'None yet')}</p><p class="mt-3 text-sm text-muted">${attendance.length} recent records shown</p></div>
    </div>
    <div class="${card} mt-5 flex flex-wrap items-center justify-between gap-4"><div><h2 class="text-xl font-bold">Attendance portal</h2><p class="mt-1 text-sm text-muted">Mark attendance once per day for your assigned subject.</p></div><a href="#/attendance" class="primary">Open attendance →</a></div>
    <div class="mt-5"><a class="text-sm text-brand underline" href="#/profile">View or update my student details</a></div>`, context);
}

export function attendanceScreen(context, attendance, message = '') {
  const today = manilaDate();
  const checked = attendance.some((r) => r.attendance_date === today && r.subject_id === context.profile.subject_id);
  const records = attendance.map((r) => `<tr class="border-t border-slate-700/60"><td class="py-3">${e(r.attendance_date)}</td><td class="py-3 text-brand">${e(r.status)}</td><td class="py-3">${e(readableTime(r.marked_at))}</td></tr>`).join('');
  return shell(`
    <div class="mb-7"><p class="mb-2 text-sm font-bold uppercase tracking-widest text-brand">Student portal</p><h1 class="text-3xl font-bold">Attendance</h1><p class="mt-2 text-muted">One check-in per Philippine calendar day for your registered subject.</p></div>
    <div class="${card} max-w-2xl"><p class="text-sm text-muted">Today • ${e(today)}</p><p class="mt-3 text-3xl font-extrabold ${checked ? 'text-brand' : 'text-white'}">${checked ? 'Attendance recorded' : 'Ready to check in'}</p><div id="attendance-message" class="my-4">${message ? formError(message) : ''}</div><button id="mark-attendance" type="button" class="primary" ${checked ? 'disabled' : ''}>${checked ? 'Already checked in today' : 'Mark me present'}</button><p class="mt-4 text-xs leading-5 text-muted">Your student ID, subject, date, and time are validated and recorded on the server.</p></div>
    <div class="${card} mt-6 overflow-x-auto"><h2 class="mb-5 text-xl font-bold">Recent attendance history</h2><table class="w-full min-w-[470px] text-left text-sm"><thead class="text-muted"><tr><th class="pb-3">Date</th><th class="pb-3">Status</th><th class="pb-3">Recorded at</th></tr></thead><tbody>${records || '<tr><td colspan="3" class="py-4 text-muted">No attendance records yet.</td></tr>'}</tbody></table></div>`, context);
}

export function adminScreen(context, data) {
  const approved = data.profiles.filter((p) => p.is_approved);
  const today = manilaDate();
  const checkedToday = new Set(data.attendance.filter((r) => r.attendance_date === today).map((r) => r.student_id));
  const present = approved.filter((p) => checkedToday.has(p.user_id)).length;
  const sections = new Map(data.sections.map((s) => [s.id, s.code]));
  const subjects = new Map(data.subjects.map((s) => [s.id, s.code]));
  const sorted = [...data.profiles].sort((a, b) => Number(a.is_approved) - Number(b.is_approved));
  const rows = sorted.map((p) => {
    const name = `${p.surname}, ${p.first_name} ${p.middle_initial}`;
    const section = sections.get(p.section_id) || 'Unknown';
    const subject = subjects.get(p.subject_id) || 'Unknown';
    return `<tr class="student-row border-t border-slate-700/70" data-search="${e(`${name} ${p.github_username} ${section} ${subject}`.toLowerCase())}">
      <td class="py-4 pr-3"><strong class="block text-slate-100">${e(name)}</strong><span class="text-xs text-muted">@${e(p.github_username)}</span></td>
      <td class="py-4 pr-3 text-slate-300">${e(section)}</td>
      <td class="py-4 pr-3 text-slate-300">${e(subject)}</td>
      <td class="py-4 pr-3 text-slate-300">${e(p.sex)}</td>
      <td class="py-4 pr-3 text-slate-300">${e(p.age)}</td>
      <td class="py-4 pr-3">${pill(p.is_approved)}</td>
      <td class="py-4 pr-3">${p.is_approved ? (checkedToday.has(p.user_id) ? '<span class="text-brand">Present</span>' : '<span class="text-amber-200">Not checked in</span>') : '—'}</td>
      <td class="py-4"><button type="button" class="secondary text-xs" data-approval="${p.is_approved ? 'false' : 'true'}" data-user-id="${e(p.user_id)}">${p.is_approved ? 'Revoke' : 'Approve'}</button></td>
    </tr>`;
  }).join('');
  const names = new Map(data.profiles.map((p) => [p.user_id, `${p.surname}, ${p.first_name}`]));
  const historyRows = data.attendance.slice(0, 30).map((record) => `
    <tr class="border-t border-slate-700/70">
      <td class="py-3 pr-4">${e(names.get(record.student_id) || 'Unknown student')}</td>
      <td class="py-3 pr-4">${e(subjects.get(record.subject_id) || 'Unknown')}</td>
      <td class="py-3 pr-4">${e(record.attendance_date)}</td>
      <td class="py-3 pr-4">${e(readableTime(record.marked_at))}</td>
    </tr>`).join('');
  const tile = (name, number, note) => `<div class="${card}"><p class="text-sm text-muted">${e(name)}</p><p class="mt-3 text-3xl font-extrabold">${number}</p><p class="mt-1 text-xs text-muted">${e(note)}</p></div>`;
  return shell(`
    <div class="mb-8 flex flex-wrap items-center justify-between gap-4"><div><p class="mb-2 text-sm font-bold uppercase tracking-widest text-brand">Admin • Private dashboard</p><h1 class="text-3xl font-extrabold">Attendance & student records</h1><p class="mt-2 text-muted">${e(today)} • Philippine time</p></div><button id="admin-refresh" class="secondary">Refresh data</button></div>
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">${tile('Submitted profiles', data.profiles.length, 'Does not include incomplete submissions')}${tile('Approved students', approved.length, 'Students permitted to check in')}${tile('Present today', present, 'At least one check-in today')}${tile('Not yet checked in', approved.length - present, 'Not necessarily absent')}</div>
    <div class="${card} mt-6"><div class="mb-5 flex flex-wrap items-center justify-between gap-4"><h2 class="text-xl font-bold">Students</h2><label class="sr-only" for="student-search">Search students</label><input id="student-search" class="field max-w-xs" placeholder="Search name, GitHub, section…" /></div>
      <div class="overflow-x-auto"><table class="w-full min-w-[940px] text-left text-sm"><thead class="text-muted"><tr><th class="pb-3">Student</th><th class="pb-3">Section</th><th class="pb-3">Subject</th><th class="pb-3">Sex</th><th class="pb-3">Age</th><th class="pb-3">Approval</th><th class="pb-3">Today</th><th class="pb-3">Action</th></tr></thead><tbody id="student-table">${rows || '<tr><td colspan="8" class="py-5 text-muted">No completed student profiles yet.</td></tr>'}</tbody></table></div>
      <p class="mt-5 text-xs leading-5 text-muted">Students are only listed after submitting a complete form. Attendance statistics use the latest retrieved records (up to 1,000); paging is needed for larger classes.</p>
    </div>
    <div class="${card} mt-6 overflow-x-auto"><h2 class="mb-5 text-xl font-bold">Recent check-ins</h2><table class="w-full min-w-[560px] text-left text-sm"><thead class="text-muted"><tr><th class="pb-3">Student</th><th class="pb-3">Subject</th><th class="pb-3">Date</th><th class="pb-3">Recorded at</th></tr></thead><tbody>${historyRows || '<tr><td colspan="4" class="py-3 text-muted">No attendance records yet.</td></tr>'}</tbody></table></div>`, context);
}

export function fatalScreen(message) {
  return shell(`<div class="${card} mx-auto max-w-xl"><h1 class="mb-4 text-2xl font-bold">Unable to load the portal</h1>${formError(message)}<button id="retry-load" class="primary mt-5">Try again</button></div>`);
}

export function setupScreen() {
  return shell(`<div class="${card} mx-auto max-w-xl"><h1 class="text-2xl font-bold">Project configuration missing</h1><p class="mt-4 leading-7 text-muted">The Supabase public URL and publishable key have not been supplied to the build yet. This repository deliberately contains no real credentials.</p></div>`);
}
