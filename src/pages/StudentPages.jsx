import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowRight, BookOpen, CalendarCheck, CalendarClock, CalendarDays,
  Check, CheckCircle2, Clock3, Code2, GraduationCap, LogOut,
  RefreshCw, ShieldCheck, UserRound, UsersRound, Info, LockKeyhole,
  AlertCircle, ExternalLink, BadgeCheck, ChevronRight, Home, CalendarRange, CircleHelp, Zap, Pencil, WifiOff, ClipboardCheck, SlidersHorizontal,
} from 'lucide-react';
import {
  Badge, Card, DataTable, Empty, MotionPage, PageAlert, PanelTitle,
  Title,
} from '../components/UI.jsx';
import { useSession } from '../state/SessionProvider.jsx';
import { logout } from '../lib/auth.js';
import { getCatalog, rpc } from '../lib/api.js';
import { readableTime } from '../lib/format.js';
import { classTime, studentClassStatus, studentScheduleSummary, validateStudentProfile } from '../lib/student-flow.js';
import { useManilaNow } from '../lib/useManilaNow.js';
import { weekdayLabel } from '../lib/schedule.js';
import { AccessLanding } from '../components/AccessLanding.jsx';
import { StudentScene, StudentMetric } from '../components/StudentExperience.jsx';
import { selectPriorityClass, groupStudentSchedule, findNextMeeting, groupAttendanceHistory, statusExplanation, recordedThisWeek } from '../lib/student-dashboard.js';

const named = (list, id) => list?.find(s => Number(s.id) === Number(id))?.code || '—';

function Journey({ stage = 1 }) {
  const steps = ['GitHub login', 'Student profile', 'Instructor approval', 'Attendance'];
  return <nav className="student-journey" aria-label="Student onboarding progress">
    {steps.map((step, index) => <div className={`student-journey-step ${index + 1 <= stage ? 'reached' : ''} ${index + 1 === stage ? 'current' : ''}`} key={step} aria-current={index + 1 === stage ? 'step' : undefined}>
      <span className="student-journey-number">{index + 1 < stage ? <Check size={14}/> : index + 1}</span>
      <span>{step}</span>
    </div>)}
  </nav>;
}

function ClassStatus({state}) {
  return <Badge tone={state.tone}>{state.label}</Badge>;
}

export function StudentLayout({ children }) {
  const { context, error, lastSyncedAt, refreshing, refreshData } = useSession();
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const location = useLocation();
  useEffect(() => {
    const on = () => { setOnline(true); refreshData(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [refreshData]);
  const approved = Boolean(context?.profile?.is_approved);
  useEffect(() => {
    // Restore a predictable viewport on intentional route changes only.
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const links = approved
    ? [{to:'/student',label:'Overview',Icon:Home,end:true},{to:'/attendance',label:'Attendance',Icon:CalendarCheck},{to:'/profile',label:'My profile',Icon:UserRound}]
    : [{to:'/profile',label:'My profile',Icon:UserRound}];
  return <div className="student-app student-experience-v59">
    <a className="student-skip-link" href="#student-main">Skip to main content</a>
    <header className="student-topbar student-v59-topbar">
      <Link to={approved ? '/student' : '/profile'} className="brand" aria-label="StudentMonitor student home">
        <img src={`${import.meta.env.BASE_URL}studentmonitor-icon.png`} className="student-brand-logo" alt=""/>
        <strong>StudentMonitor<span className="brand-dot">.</span></strong>
      </Link>
      <nav className="student-nav student-v59-desktop-nav" aria-label="Student navigation">
        {links.map(({to,label,Icon,end}) => <NavLink key={to} to={to} end={end}>
          <Icon size={17} aria-hidden="true"/>{label}
        </NavLink>)}
      </nav>
      <div className="student-v59-account">
        <span className="student-v59-account-avatar" aria-hidden="true">{(context?.profile?.first_name || 'S').slice(0,1).toUpperCase()}</span>
        <div className="student-v59-account-meta"><strong>{context?.profile?.first_name || 'Student'}</strong><small>{approved ? 'Verified account' : 'Student account'}</small></div>
        <button type="button" className="student-logout student-static-action" onClick={logout} aria-label="Log out of StudentMonitor"><LogOut size={17} aria-hidden="true"/><span>Log out</span></button>
      </div>
    </header>
    {(!online || error) && <div className="student-v6-system-notice" role="status">
      <WifiOff size={16} aria-hidden="true"/>
      <span>{!online ? 'You appear to be offline. Attendance cannot be submitted until your connection returns.' : `Unable to refresh student data: ${error}`}</span>
      {online && <button type="button" onClick={() => refreshData()} disabled={refreshing}>Try again</button>}
    </div>}
    <main className="student-main student-v59-main" id="student-main" tabIndex={-1}>
      {lastSyncedAt && approved && <div className="student-v6-sync" aria-label="Data synchronization"><span className="student-v59-live-dot"/> Records synced at {new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit'}).format(new Date(lastSyncedAt))} PHT{refreshing ? ' · Updating…' : ''}</div>}
      {children}
    </main>
    {approved && <nav className="student-v59-mobile-nav" aria-label="Mobile student navigation">
      {links.map(({to,label,Icon,end}) => <NavLink key={to} to={to} end={end}><Icon size={20} aria-hidden="true"/><span>{label}</span></NavLink>)}
    </nav>}
    <footer className="student-footer student-v59-footer"><span>StudentMonitor</span><span>Schedules and check-in times use Philippine time (PHT).</span></footer>
  </div>;
}

export function LoginPage() {
  // An intentionally focused access page; student flows remain unchanged.
  return <AccessLanding/>;
}

function FormField({ label, children, hint }) {
  return <label className="field-label"><span>{label} <em aria-hidden="true">*</em></span>{children}{hint && <small className="student-field-hint">{hint}</small>}</label>;
}

export function ProfilePage() {
  const { context, catalog: cached, reload } = useSession();
  const navigate = useNavigate();
  const p = context?.profile;
  const approved = Boolean(p?.is_approved);
  const [catalog, setCatalog] = useState(cached);
  const [verified, setVerified] = useState('');
  const [identityLoading, setIdentityLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!approved);
  const [form, setForm] = useState({
    surname: p?.surname || '', first_name: p?.first_name || '',
    middle_initial: p?.middle_initial || '', sex: p?.sex || '',
    age: p?.age ?? '', section_id: String(p?.section_id || ''),
    subject_id: String(p?.subject_id || ''), github_username: p?.github_username || '',
  });

  useEffect(() => {
    let live = true;
    setIdentityLoading(true);
    Promise.all([cached ? Promise.resolve(cached) : getCatalog(), rpc('current_github_username')])
      .then(([cat, github]) => {
        if (!live) return;
        setCatalog(cat);
        setVerified(github || '');
        setForm(previous => ({ ...previous, github_username: github || previous.github_username }));
      })
      .catch(err => { if (live) setProfileError(err.message || 'Unable to fetch student information.'); })
      .finally(() => { if (live) setIdentityLoading(false); });
    return () => { live = false; };
  }, [cached]);

  const allowed = useMemo(() => new Set((catalog?.sectionSubjects || [])
    .filter(pair => Number(pair.section_id) === Number(form.section_id))
    .map(pair => Number(pair.subject_id))), [catalog, form.section_id]);

  function update(name, value) {
    setForm(previous => ({ ...previous, [name]: value, ...(name === 'section_id' ? { subject_id: '' } : {}) }));
    if (profileError) setProfileError('');
  }

  async function submit(event) {
    event.preventDefault();
    const result = validateStudentProfile(form, catalog, verified, approved ? p : null);
    if (result.error) { setProfileError(result.error); return; }
    setBusy(true); setProfileError('');
    try {
      await rpc('save_student_profile', result.payload);
      await reload({ silent: true });
      if (approved) setEditing(false);
      else navigate('/pending', { replace: true });
    } catch (err) {
      setProfileError(err.message || 'The profile could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  const displayName = [form.first_name, form.surname].filter(Boolean).join(' ').trim() || 'Student';
  const sectionName = (catalog?.sections || []).find(s => String(s.id) === String(form.section_id))?.code || 'Not assigned';
  const subjectName = (catalog?.subjects || []).find(s => String(s.id) === String(form.subject_id))?.code || 'Not assigned';

  return <MotionPage>
    <div className="student-record-page">
      <header className="student-record-header">
        <div>
          <div className="student-record-crumb">STUDENT WORKSPACE <ChevronRight size={13} aria-hidden="true"/> PERSONAL RECORD</div>
          <h1>{approved ? 'My student record' : 'Complete your profile'}<span className="student-record-period">.</span></h1>
          <p>{approved ? 'Review your details and keep your information accurate.' : 'Add your official details to request access to your class workspace.'}</p>
        </div>
        <span className={`student-record-state ${approved ? 'is-approved' : 'is-incomplete'}`}>
          {approved ? <CheckCircle2 size={16} aria-hidden="true"/> : <Clock3 size={16} aria-hidden="true"/>}
          {approved ? 'Instructor approved' : 'Profile setup'}
        </span>
      </header>
      {!approved && <Journey stage={2}/>}
      <div className="student-profile-layout student-record-layout">
        <Card className="profile-card student-record-form-card">
          <div className="student-record-form-intro">
            <div><span className="student-record-index">STUDENT INFORMATION</span><h2>Personal details</h2><p>Use the same name you use on official class records.</p></div>
            <span className="student-record-counter">01 / 02</span>
          </div>
          <PageAlert message={profileError} onClose={() => setProfileError('')}/>
          {approved && !editing ? <div className="student-v6-profile-summary" aria-label="Approved student details">
            <div className="student-v6-profile-header"><span className="student-record-index">VERIFIED STUDENT RECORD</span><button type="button" className="student-v6-edit" onClick={() => setEditing(true)}><Pencil size={15} aria-hidden="true"/> Edit personal details</button></div>
            <dl className="student-v6-readonly-grid">
              <div><dt>Surname</dt><dd>{form.surname}</dd></div><div><dt>First name</dt><dd>{form.first_name}</dd></div>
              <div><dt>Middle initial</dt><dd>{form.middle_initial}</dd></div><div><dt>Sex</dt><dd>{form.sex}</dd></div>
              <div><dt>Age</dt><dd>{form.age}</dd></div><div><dt>Section</dt><dd>{sectionName}</dd></div>
              <div><dt>Primary subject</dt><dd>{subjectName}</dd></div><div><dt>Authenticated GitHub</dt><dd>{verified ? `@${verified}` : 'Verification pending'}</dd></div>
            </dl>
            <p className="student-v6-profile-lock"><LockKeyhole size={16} aria-hidden="true"/> Section and subject changes are managed by your instructor.</p>
          </div> : <form className="profile-form student-record-form" onSubmit={submit}>
            <fieldset className="student-record-section">
              <legend className="student-record-section-legend"><span>01</span> Identity</legend>
              <div className="student-record-fields student-record-personal">
                <FormField label="Surname"><input required maxLength={80} autoComplete="family-name" value={form.surname} onChange={e => update('surname', e.target.value)}/></FormField>
                <FormField label="First name"><input required maxLength={80} autoComplete="given-name" value={form.first_name} onChange={e => update('first_name', e.target.value)}/></FormField>
                <FormField label="Middle initial" hint="One letter or N/A"><input required maxLength={3} value={form.middle_initial} onChange={e => update('middle_initial', e.target.value)} placeholder="A or N/A"/></FormField>
                <FormField label="Sex"><select required value={form.sex} onChange={e => update('sex', e.target.value)}><option value="">Select an option</option>{['Male','Female','Prefer not to say'].map(value => <option key={value} value={value}>{value}</option>)}</select></FormField>
                <FormField label="Age"><input required type="number" min="12" max="99" step="1" value={form.age} onChange={e => update('age', e.target.value)}/></FormField>
              </div>
            </fieldset>
            <fieldset className="student-record-section">
              <legend className="student-record-section-legend"><span>02</span> Class assignment & account</legend>
              <p className="student-record-section-caption">Your class selection determines which subjects and attendance windows are available.</p>
              <div className="student-record-fields student-record-academic">
                <FormField label="Section" hint={approved ? 'Instructor-managed after approval' : 'Choose your assigned class'}><select required disabled={approved} value={form.section_id} onChange={e => update('section_id', e.target.value)}><option value="">Choose section</option>{(catalog?.sections || []).map(s => <option key={s.id} value={s.id}>{s.code}</option>)}</select></FormField>
                <FormField label="Primary subject" hint="Other assigned subjects will appear on your timetable"><select required disabled={approved} value={form.subject_id} onChange={e => update('subject_id', e.target.value)}><option value="">Choose subject</option>{(catalog?.subjects || []).filter(s => allowed.has(Number(s.id))).map(s => <option key={s.id} value={s.id}>{s.code}</option>)}</select></FormField>
                <div className="student-record-github-field">
                  <FormField label="Linked GitHub account" hint="Read-only · verified from your GitHub sign-in"><div className="student-verified-input"><Code2 size={18} aria-hidden="true"/><input readOnly aria-label="Verified GitHub username" value={identityLoading ? 'Checking GitHub account…' : verified ? `@${verified}` : 'Identity could not be verified'}/><BadgeCheck size={19} aria-label={verified ? 'Authenticated GitHub identity' : 'GitHub identity pending'}/></div></FormField>
                </div>
              </div>
            </fieldset>
            <div className="student-record-submit-bar">
              <p><ShieldCheck size={17} aria-hidden="true"/>{approved ? 'Section and subject changes require your instructor.' : 'Information is checked before your instructor reviews it.'}</p>
              <div className="student-v6-profile-actions">
                {approved && <button type="button" className="student-v6-edit-cancel" disabled={busy} onClick={() => {setEditing(false);setProfileError('');setForm({surname:p?.surname||'',first_name:p?.first_name||'',middle_initial:p?.middle_initial||'',sex:p?.sex||'',age:p?.age??'',section_id:String(p?.section_id||''),subject_id:String(p?.subject_id||''),github_username:p?.github_username||''});}}>Cancel</button>}
                <button type="submit" className="btn primary student-record-submit" disabled={busy || identityLoading || !verified || !catalog}>{busy ? 'Saving…' : approved ? 'Save changes' : 'Submit for approval'} <ArrowRight size={16} aria-hidden="true"/></button>
              </div>
            </div>
          </form>}
        </Card>
        <aside className="student-record-sidebar" aria-label="Account information">
          <section className="student-record-summary">
            <div className="student-record-summary-header"><span>ACCOUNT OVERVIEW</span><ShieldCheck size={17} aria-hidden="true"/></div>
            <div className="student-record-identity">
              <span className="student-record-monogram" aria-hidden="true">{(form.first_name || 'S').slice(0,1).toUpperCase()}{(form.surname || '').slice(0,1).toUpperCase()}</span>
              <div><strong>{displayName}</strong><span>{verified ? `@${verified}` : 'GitHub verification pending'}</span></div>
            </div>
            <dl className="student-record-summary-list">
              <div><dt>Profile</dt><dd>{approved ? 'Approved' : 'Pending submission'}</dd></div>
              <div><dt>Section</dt><dd>{sectionName}</dd></div>
              <div><dt>Primary subject</dt><dd>{subjectName}</dd></div>
            </dl>
            <div className="student-record-summary-footer"><LockKeyhole size={15} aria-hidden="true"/><span>Only you and authorized instructors can access your record.</span></div>
          </section>
          <section className="student-record-guidance">
            <span className="student-record-index">{approved ? 'MANAGING YOUR RECORD' : 'NEXT STEPS'}</span>
            <h3>{approved ? 'Need to change classes?' : 'After you submit'}</h3>
            <p>{approved ? 'Contact your instructor to change your assigned section or subject. You can still update your personal details here.' : 'Your instructor will review your information. Attendance becomes available once your profile is approved.'}</p>
            {approved && <Link to="/student">Return to dashboard <ArrowRight size={15} aria-hidden="true"/></Link>}
          </section>
        </aside>
      </div>
    </div>
  </MotionPage>;
}

export function PendingPage() {
  const { context, refreshData, refreshing } = useSession();
  const [localError, setLocalError] = useState('');
  const check = async () => {
    setLocalError('');
    try { await refreshData(); } catch (err) { setLocalError(err.message || 'Unable to check approval.'); }
  };
  return <MotionPage>
    <Journey stage={3}/>
    <Card className="pending-card">
      <div className="pending-icon"><Clock3 size={34}/></div>
      <span className="eyebrow">PROFILE SUBMITTED</span>
      <h1>Waiting for instructor approval</h1>
      <p>Thanks, <strong>{context.profile.first_name}</strong>. Your information was saved successfully. You can view and edit your profile, but attendance remains locked until your instructor approves your account.</p>
      <Badge tone="warn">Approval pending</Badge>
      <PageAlert message={localError}/>
      <div className="pending-actions"><Link className="btn subtle" to="/profile">Review my profile</Link><button className="btn primary" disabled={refreshing} onClick={check}><RefreshCw size={16}/>{refreshing ? 'Checking…' : 'Check approval status'}</button></div>
      <small className="student-pending-hint">This page also checks for updates periodically while it is open.</small>
    </Card>
  </MotionPage>;
}

export function StudentHome() {
  const { context, data } = useSession();
  const { now, clock } = useManilaNow();
  const [chosenDay, setChosenDay] = useState(null);
  const overview = useMemo(() => studentScheduleSummary(data, clock, now), [data, clock.date, clock.weekday, clock.minutes, now]);
  if (!data) return <Empty>Loading your class information.</Empty>;
  const profile = context.profile;
  const section = named(data.sections, profile.section_id);
  const weekGroups = groupStudentSchedule(overview.week);
  const allDone = overview.today.length > 0 && overview.checkedIn === overview.today.length;
  const priority = allDone ? null : selectPriorityClass(overview.today.filter(item => !['recorded','finished','closed'].includes(item.key)));
  const futureCandidates = overview.week.filter(schedule => !overview.today.some(item =>
    Number(item.schedule.id) === Number(schedule.id) && ['recorded','closed','finished'].includes(item.key)
  ));
  const nextMeeting = findNextMeeting(futureCandidates, clock);
  const activeSchedule = priority?.schedule || nextMeeting?.schedule || null;
  const selectedDay = chosenDay ?? clock.weekday;
  const selectedMeetings = weekGroups.find(group => Number(group.weekday) === selectedDay)?.meetings || [];
  const recent = (data.attendance || []).slice(0,3);

  return <StudentScene>
    <section data-student-enter className="student-v59-hero" aria-label="Student dashboard overview">
      <div className="student-v59-hero-copy">
        <div className="student-v59-eyebrow"><span className="student-v59-live-dot"/> SECTION {section} <span className="student-v59-middle-dot">·</span> STUDENT WORKSPACE</div>
        <h1>Your classes, {profile.first_name}<span className="student-v59-title-period">.</span></h1>
        <p>See what’s scheduled today, check your attendance status, and keep up with your weekly timetable.</p>
        <div className="student-v59-hero-actions">
          <Link className="student-v59-action-primary" to="/attendance"><CalendarCheck size={18} aria-hidden="true"/> View attendance <ArrowRight size={17} aria-hidden="true"/></Link>
          <Link className="student-v59-action-quiet" to="/profile">My information <ChevronRight size={16} aria-hidden="true"/></Link>
        </div>
      </div>
      <div className="student-v59-next" aria-label="Your next class">
        <div className="student-v59-next-top"><span>MY NEXT CLASS</span><CalendarClock size={19} aria-hidden="true"/></div>
        {activeSchedule ? <>
          <strong>{named(data.subjects, activeSchedule.subject_id)}</strong>
          <span className="student-v59-next-sub">{weekdayLabel(activeSchedule.weekday)} · {classTime(activeSchedule)} · Section {section}</span>
          <div className="student-v59-next-bottom">
            {priority ? <ClassStatus state={priority}/> : <span className="student-v6-next-day">{nextMeeting?.daysAway === 0 ? 'Later today' : nextMeeting?.daysAway === 1 ? 'Tomorrow' : `In ${nextMeeting?.daysAway} days`}</span>}
            {priority ? <Link to="/attendance" aria-label="Open attendance status"><ArrowRight size={18}/></Link> : <BookOpen size={18} aria-label="See your weekly timetable below"/>}
          </div>
          <p className="student-v6-next-explainer">{priority ? statusExplanation(priority.key) : 'Next scheduled class. Attendance opens only when your instructor allows check-in.'}</p>
        </> : <><strong>No class assigned yet</strong><span className="student-v59-next-sub">Please contact your instructor for your timetable.</span></>}
      </div>
    </section>

    <section data-student-enter className="student-v59-metrics" aria-label="My attendance summary">
      <StudentMetric Icon={CalendarDays} label="Classes today" value={overview.today.length} detail="Scheduled sessions" tone="cream"/>
      <StudentMetric Icon={CheckCircle2} label="Check-ins this week" value={recordedThisWeek(data.attendance || [], clock)} detail="Server-confirmed records" tone="sage"/>
      <StudentMetric Icon={CalendarClock} label="Open check-ins" value={overview.open} detail="Only instructor-opened meetings" tone="mint"/>
      <StudentMetric Icon={BookOpen} label="Assigned subjects" value={new Set(overview.week.map(s=>s.subject_id)).size} detail="From your verified section" tone="cream"/>
    </section>

    <div className="student-v59-dashboard-grid">
      <section data-student-enter className="student-v59-panel student-v59-today" aria-labelledby="today-title">
        <div className="student-v59-panel-heading"><div className="student-v59-panel-icon"><CalendarCheck size={20}/></div><div><span className="student-v59-overline">AT A GLANCE</span><h2 id="today-title">Today's classes</h2><p>Your scheduled meetings for today, in Philippine time.</p></div><Link to="/attendance" className="student-v59-panel-link">See attendance <ArrowRight size={16}/></Link></div>
        <div className="student-v59-session-list">
          {overview.today.map(({schedule,...state}) => <div className={`student-v59-session ${state.canCheckIn ? 'is-open' : ''}`} key={schedule.id}>
            <div className="student-v59-session-time"><Clock3 size={15}/><span>{classTime(schedule)}</span></div>
            <div className="student-v59-session-info"><strong>{named(data.subjects,schedule.subject_id)}</strong><small>Section {section} · {weekdayLabel(schedule.weekday)}</small></div>
            <div className="student-v59-session-state"><ClassStatus state={state}/>{state.canCheckIn && <Link to="/attendance" className="student-v59-check-link" aria-label={`Check in for ${named(data.subjects,schedule.subject_id)}`}><ArrowRight size={17}/></Link>}</div>
          </div>)}
          {overview.today.length === 0 && <div className="student-v59-empty"><CalendarRange size={22}/><strong>No class scheduled today</strong><span>Your assigned subjects and meeting times are listed below.</span></div>}
        </div>
      </section>
      <section data-student-enter className="student-v59-panel student-v59-profile" aria-labelledby="account-title">
        <div className="student-v59-panel-heading"><div className="student-v59-panel-icon"><UserRound size={20}/></div><div><span className="student-v59-overline">STUDENT ACCOUNT</span><h2 id="account-title">Your information</h2><p>Approved by your instructor</p></div></div>
        <div className="student-v59-student-identity"><div className="student-v59-identity-avatar" aria-hidden="true">{(profile.first_name || 'S')[0]}{(profile.surname || '')[0]}</div><div><strong>{profile.first_name} {profile.surname}</strong><span>@{profile.github_username}</span></div><span className="student-v59-verified"><ShieldCheck size={14}/> Approved</span></div>
        <dl className="student-v59-details"><div><dt>Assigned section</dt><dd>{section}</dd></div><div><dt>Primary subject</dt><dd>{named(data.subjects,profile.subject_id)}</dd></div><div><dt>Profile status</dt><dd>Instructor verified</dd></div></dl>
        <Link to="/profile" className="student-v59-profile-action">View my profile <ArrowRight size={16}/></Link>
      </section>
    </div>

    <section data-student-enter className="student-v59-panel student-v59-timetable" aria-labelledby="timetable-title">
      <div className="student-v59-panel-heading"><div className="student-v59-panel-icon"><BookOpen size={20}/></div><div><span className="student-v59-overline">YOUR WEEK</span><h2 id="timetable-title">Class timetable</h2><p>Official meetings for Section {section}</p></div><span className="student-v59-timetable-counter">{overview.week.length} meetings / week</span></div>
      <div className="student-v6-weekday-tabs" role="group" aria-label="Select timetable day">
        {[1,2,3,4,5,6,7].map(day => <button type="button" key={day} aria-pressed={selectedDay===day} onClick={() => setChosenDay(day)} className={selectedDay===day?'selected':''}>{weekdayLabel(day).slice(0,3)}{clock.weekday===day && <span className="student-v6-day-today">Today</span>}</button>)}
      </div>
      {selectedMeetings.length ? <div className="student-v6-day-schedule">{selectedMeetings.map(schedule => <div className="student-v6-day-session" key={schedule.id}><span className="student-v6-day-clock">{classTime(schedule)}</span><div><strong>{named(data.subjects,schedule.subject_id)}</strong><small>Section {section}</small></div>{clock.weekday===selectedDay && <ClassStatus state={studentClassStatus(schedule,data,clock,now)}/>}</div>)}</div>
        : <div className="student-v59-empty"><CalendarDays size={22}/><strong>No class on {weekdayLabel(selectedDay)}</strong><span>Choose another day to see your meetings.</span></div>}
      <div className="student-v6-recent"><div className="student-v6-recent-header"><h3>Recent check-ins</h3><Link to="/attendance">Full history <ArrowRight size={14}/></Link></div>
        {recent.length ? recent.map(record=><div className="student-v6-recent-row" key={record.id}><span>{named(data.subjects,record.subject_id)}</span><time>{record.attendance_date}</time><Badge tone="good">Recorded</Badge></div>) : <p>No attendance recorded yet. Your confirmed check-ins will appear here.</p>}
      </div>
    </section>
  </StudentScene>;
}

export function StudentAttendance() {
  const { data, refreshData, refreshing, perform } = useSession();
  const { now, clock } = useManilaNow();
  const [feedback, setFeedback] = useState({ message: '', success: false });
  const [busy, setBusy] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [subjectFilter,setSubjectFilter] = useState('all');
  const [historyLimit,setHistoryLimit] = useState(12);
  const overview = useMemo(() => studentScheduleSummary(data, clock, now), [data, clock.date, clock.weekday, clock.minutes, now]);

  async function checkin(schedule) {
    const state = studentClassStatus(schedule, data, clock, now);
    if (!state.canCheckIn) {
      setConfirmId(null);
      setFeedback({ message: 'This class is no longer open for check-in. Refresh the attendance status.', success: false });
      return;
    }
    setBusy(schedule.id); setFeedback({ message: '', success: false });
    try {
      const saved = await perform(() => rpc('mark_my_attendance', { p_schedule_id: Number(schedule.id) }));
      setReceipt({ ...saved, subject: named(data.subjects, schedule.subject_id) });
      setFeedback({ message: 'Check-in confirmed by the server.', success: true });
    } catch (err) {
      setFeedback({ message: err.message || 'Unable to record attendance.', success: false });
    } finally { setBusy(null); setConfirmId(null); }
  }

  async function refresh() {
    setFeedback({ message: '', success: false });
    try { await refreshData(); } catch(err) {setFeedback({message:err.message||'Could not refresh.',success:false});}
  }

  return <StudentScene>
    <header data-student-enter className="student-v59-attendance-header">
      <div><span className="student-v59-overline">MY ATTENDANCE · {weekdayLabel(clock.weekday).toUpperCase()}</span><h1>Check in to class<span className="student-v59-title-period">.</span></h1><p>{clock.date} · All times are in the Philippines (PHT).</p></div>
      <button className="student-v59-refresh" type="button" onClick={refresh} disabled={refreshing}><RefreshCw size={16} className={refreshing ? 'student-v59-spinning' : ''}/>{refreshing ? 'Refreshing…' : 'Refresh status'}</button>
    </header>
    <div data-student-enter className="student-v59-privacy-note"><ShieldCheck size={18} aria-hidden="true"/><span>Check-in is only available for your section while the instructor has opened attendance. Each class meeting accepts one check-in.</span></div>
    {receipt && <div className="student-v6-receipt" role="status" aria-live="polite"><ClipboardCheck size={24} aria-hidden="true"/><div><strong>Attendance saved</strong><p>{receipt.subject} · {receipt.attendance_date} · {receipt.marked_at ? readableTime(receipt.marked_at) : 'Server confirmed'}</p><small>Record reference: {receipt.id ?? 'Recorded'}</small></div><button type="button" aria-label="Dismiss check-in receipt" onClick={() => setReceipt(null)}>×</button></div>}
    {feedback.message && <div role="status" aria-live="polite" className={`student-action-feedback ${feedback.success ? 'success' : 'error'}`}><span>{feedback.success ? <CheckCircle2 size={18}/> : <AlertCircle size={18}/>}</span>{feedback.message}<button type="button" onClick={() => setFeedback({ message:'', success:false })} aria-label="Dismiss message">×</button></div>}
    <section data-student-enter aria-labelledby="meeting-heading" className="student-v59-panel student-v59-attendance-panel">
      <div className="student-v59-panel-heading"><div className="student-v59-panel-icon"><CalendarClock size={20}/></div><div><span className="student-v59-overline">SCHEDULED TODAY</span><h2 id="meeting-heading">Today's check-in windows</h2><p>{overview.today.length} class meeting{overview.today.length === 1 ? '' : 's'} on your timetable</p></div></div>
      <div className="student-v59-checkins">
        {overview.today.map(({schedule, ...state}) => <article className={`student-v59-checkin ${state.canCheckIn ? 'is-open' : ''}`} key={schedule.id}>
          <div className="student-v59-checkin-main"><div className="student-v59-session-time"><Clock3 size={15}/>{classTime(schedule)}</div><h3>{named(data.subjects, schedule.subject_id)}</h3><ClassStatus state={state}/><p className="student-v6-checkin-state-explanation">{statusExplanation(state.key)}</p></div>
          <div className="student-v59-checkin-action">
            {state.key === 'recorded' ? <div className="student-v59-confirmed"><CheckCircle2 size={18}/> Successfully recorded</div>
              : state.canCheckIn && confirmId === schedule.id ? <div className="student-confirm-checkin" role="group" aria-label="Confirm class check-in"><p>Confirm your attendance for this class meeting?</p><div><button className="btn subtle small" onClick={() => setConfirmId(null)} disabled={busy !== null}>Cancel</button><button className="btn primary small" disabled={busy !== null} onClick={() => checkin(schedule)}>{busy === schedule.id ? 'Submitting…' : 'Confirm check-in'}</button></div></div>
              : state.canCheckIn ? <button className="btn primary student-v59-checkin-button" disabled={busy !== null} onClick={() => setConfirmId(schedule.id)}>Mark me present <ArrowRight size={17}/></button>
              : <p className="student-checkin-hint">{state.key === 'upcoming' ? 'Check-in becomes available when class starts and your instructor opens it.' : state.key === 'finished' ? 'This class meeting has ended.' : state.key === 'closed' ? 'Your instructor has closed check-in.' : 'Waiting for your instructor to open attendance.'}</p>}
          </div>
        </article>)}
        {overview.today.length === 0 && <div className="student-v59-empty"><CalendarDays size={23}/><strong>No classes scheduled today</strong><span>Check your weekly timetable on the dashboard.</span><Link to="/student">Go to dashboard <ArrowRight size={15}/></Link></div>}
      </div>
    </section>
    <section data-student-enter className="student-v59-panel student-v59-history" aria-labelledby="history-heading">
      <div className="student-v59-panel-heading"><div className="student-v59-panel-icon"><CalendarCheck size={20}/></div><div><span className="student-v59-overline">SERVER-CONFIRMED RECORDS</span><h2 id="history-heading">My attendance history</h2><p>Recent saved check-ins (up to 250). No automatic absence labels.</p></div><span className="student-v59-timetable-counter">{(data?.attendance || []).length} records</span></div>
      <div className="student-v6-history-toolbar"><label htmlFor="history-subject">Filter by subject</label><select id="history-subject" value={subjectFilter} onChange={e=>{setSubjectFilter(e.target.value);setHistoryLimit(12);}}><option value="all">All subjects</option>{groupAttendanceHistory(data?.attendance || [],data?.subjects || []).map(group=><option value={group.subjectId} key={group.subjectId}>{group.subject}</option>)}</select></div>
      {(()=>{const groups=groupAttendanceHistory(data?.attendance || [],data?.subjects || []).filter(group=>subjectFilter==='all'||String(group.subjectId)===subjectFilter);let left=historyLimit;const rendered=groups.map(group=>{const records=group.records.slice(0,Math.max(0,left));left-=records.length;return {...group,records};}).filter(group=>group.records.length);const total=groups.reduce((n,g)=>n+g.records.length,0);return <>
        {rendered.length? <div className="student-v6-history-groups">{rendered.map(group=><section className="student-v6-history-group" key={group.subjectId}><div className="student-v6-history-group-head"><strong>{group.subject}</strong><span>{group.records.length} shown</span></div>{group.records.map(record=><div className="student-v6-history-item" key={record.id}><div><strong>{record.attendance_date}</strong><small>{record.marked_at?readableTime(record.marked_at):'Time unavailable'}</small></div><Badge tone="good">Recorded</Badge></div>)}</section>)}</div> : <div className="student-v59-empty"><CalendarCheck size={22}/><strong>No check-ins recorded</strong><span>Once your instructor opens attendance and you check in, the record will appear here.</span></div>}
        {total > historyLimit && <button type="button" className="student-v6-show-more" onClick={()=>setHistoryLimit(n=>n+12)}>Show more records</button>}
      </>;})()}
    </section>
  </StudentScene>;
}
