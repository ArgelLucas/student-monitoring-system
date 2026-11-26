import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Link,NavLink,Outlet,useLocation,useNavigate,useSearchParams} from 'react-router-dom';
import {gsap} from 'gsap';
import {useGSAP} from '@gsap/react';
import {Activity,ArrowRight,BarChart3,Bell,BookOpen,CalendarCheck,CalendarClock,CalendarDays,Check,CheckCircle2,ChevronRight,Clock3,Download,Filter,GraduationCap,LayoutDashboard,LogOut,Menu,Moon,RefreshCw,Search,ShieldCheck,Sun,UsersRound,X} from 'lucide-react';
import {Card,Title,Badge,Empty,PageAlert,MotionPage,RevealList,StatCard,PanelTitle,Modal,DataTable} from '../components/UI.jsx';
import {useDashboardFocus, FocusButton} from '../components/DashboardFocus.jsx';
import {useSession} from '../state/SessionProvider.jsx';
import {logout} from '../lib/auth.js';
import {rpc} from '../lib/api.js';
import {manilaClock,timeLabel,weekdayLabel,classInProgress,todayWindow,windowIsOpen,scheduleSort} from '../lib/schedule.js';
import {readableTime} from '../lib/format.js';
import {attendanceTrend} from './legacy-trend.js';
import {buildMeetingReport,summarizeMeetingReport,toCsv} from '../lib/report.js';
import { buildDailyRosterReport, summarizeDailyRoster, toDailyRosterCsv } from '../lib/daily-register.js';

const NAV=[['/admin','Overview',LayoutDashboard],['/admin/students','Students',UsersRound],['/admin/attendance','Attendance',CalendarCheck],['/admin/classes','Classes',BookOpen],['/admin/reports','Reports',BarChart3],['/admin/audit','Activity log',Activity]];
const section=(data,id)=>data.sections.find(s=>Number(s.id)===Number(id))?.code||'—';
const subject=(data,id)=>data.subjects.find(s=>Number(s.id)===Number(id))?.code||'—';
const fullName=p=>`${p.first_name||''} ${p.surname||''}`.trim();
const initials=p=>`${p.first_name?.[0]||'?'}${p.surname?.[0]||'?'}`.toUpperCase();
const openFor=(s,d,c=manilaClock())=>classInProgress(s,c)&&windowIsOpen(todayWindow(s,d.windows,c));
const timeFor=s=>`${timeLabel(s.start_time)} – ${timeLabel(s.end_time)}`;

function useTheme(){const [theme,setTheme]=useState(()=>localStorage.getItem('sm-theme')==='dark'?'dark':'light');useLayoutEffect(()=>{document.documentElement.setAttribute('data-theme',theme);localStorage.setItem('sm-theme',theme);},[theme]);return [theme,()=>setTheme(t=>t==='light'?'dark':'light')];}
export function AdminLayout(){
 const {context,data,error,setError,refreshing,refreshData}=useSession();
 const [mobile,setMobile]=useState(false);const [theme,toggleTheme]=useTheme();const [query,setQuery]=useState('');const navigate=useNavigate();const location=useLocation();
 const navRef=useRef(null);
 const firstNavPosition=useRef(true);
 useGSAP(() => {
   const nav=navRef.current;
   const indicator=nav?.querySelector('.nav-active-indicator');
   const active=nav?.querySelector('.nav-link.active');
   if (!indicator || !active) return;
   const position={y: active.offsetTop, height: active.offsetHeight};
   if (firstNavPosition.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
     gsap.set(indicator, position);
   } else {
     gsap.to(indicator, {...position,duration:0.42,ease:'power3.out',overwrite:'auto'});
   }
   firstNavPosition.current=false;
 }, {scope: navRef, dependencies:[location.pathname,Boolean(data)]});
 useGSAP(() => {
   if (!mobile || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
   gsap.fromTo(navRef.current?.querySelectorAll('.nav-link')||[], {x:-12,autoAlpha:0}, {
     x:0,autoAlpha:1,duration:.36,stagger:.045,ease:'power2.out',clearProps:'all'
   });
 }, {scope: navRef,dependencies:[mobile,Boolean(data)]});
 const pending=data?.profiles?.filter(p=>!p.is_approved).length||0;
 useEffect(()=>setMobile(false),[location.pathname]);
 useEffect(()=>{const key=e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();document.getElementById('global-search')?.focus();}if(e.key==='Escape')setMobile(false);};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 if(!data)return <div className="center-screen"><div className="spinner"/><p>Preparing administrator data…</p></div>;
 return <div className="app-layout verdant-app classroom-app">
   {mobile&&<button className="mobile-backdrop" aria-label="Close navigation" onClick={()=>setMobile(false)}/>}
   <aside className={`sidebar ${mobile?'show':''}`} aria-label="Admin navigation">
    <Link className="brand" to="/admin"><img className="brand-mark" src={`${import.meta.env.BASE_URL}studentmonitor-icon.png`} alt=""/><strong>StudentMonitor<span className="brand-dot">.</span></strong></Link>
    <div className="sidebar-scroll"><div className="sidebar-kicker">MY WORKSPACE <span className="sidebar-kicker-dot" aria-hidden="true"/></div><nav ref={navRef} className="nav-list"><span className="nav-active-indicator" aria-hidden="true"/>{NAV.map(([url,label,Icon])=><NavLink key={url} to={url} end={url==='/admin'} className={({isActive})=>`nav-link ${isActive?'active':''}`}><Icon size={19}/>{label}{label==='Students'&&pending>0&&<small className="nav-count">{pending}</small>}</NavLink>)}</nav>
    <div className="nav-separator"/><div className="sidebar-kicker">QUICK ACCESS</div><Link className="nav-link" to="/admin/classes"><CalendarClock size={19}/>Class controls</Link><Link className="nav-link" to="/admin/reports"><Download size={19}/>Export records</Link><button type="button" className="nav-link sidebar-theme-link" onClick={toggleTheme}>{theme==='light'?<Moon size={19}/>:<Sun size={19}/>}Appearance</button></div>
    <div className="sidebar-bottom-note"><span className="sidebar-status-dot"/> StudentMonitor Workspace <small>Private administrator portal</small></div>
   </aside>
   <div className="workspace"><header className="topbar"><div className="topbar-left"><button className="icon-btn mobile-menu" aria-label="Open menu" onClick={()=>setMobile(true)}><Menu size={22}/></button><div className="crumb">StudentMonitor <ChevronRight size={15}/> <strong>{NAV.find(([url])=>url===location.pathname)?.[1]||'Dashboard'}</strong></div></div>
   <div className="topbar-right"><form className="search-box" onSubmit={e=>{e.preventDefault();navigate('/admin/students?q='+encodeURIComponent(query.trim()));}}><Search size={18}/><input id="global-search" aria-label="Search students" placeholder="Search students or GitHub…" value={query} onChange={e=>setQuery(e.target.value)}/><kbd>Ctrl K</kbd></form><Link className="icon-btn notification" to="/admin/students?approval=pending" title="Review pending students" aria-label={`${pending} pending approvals`}><Bell size={21}/>{pending>0&&<span className="notification-dot"/>}</Link><button className="icon-btn theme-btn" title={theme==='light'?'Switch to dark mode':'Switch to light mode'} aria-label={theme==='light'?'Switch to dark mode':'Switch to light mode'} onClick={toggleTheme}>{theme==='dark'?<Sun size={21}/>:<Moon size={21}/>}</button><div className="admin-avatar" aria-hidden="true">A</div><span className="admin-label">Admin<small>Administrator</small></span><button className="icon-btn logout-btn" onClick={logout} title="Log out" aria-label="Log out"><LogOut size={20}/></button></div></header>
   <main className="main-area" id="main-area"><PageAlert message={error} onClose={()=>setError('')}/>{data.schemaWarnings?.length>0&&<PageAlert message={data.schemaWarnings.join(' ')}/>}<div className="main-refresh-indicator" aria-live="polite">{refreshing?'Updating…':''}</div><Outlet/></main><footer className="footer">StudentMonitor v5.5 · Asia/Manila class time · Database authorization by Supabase</footer></div>
 </div>;
}

function AttendanceGraph({buckets}){
 const chart=useRef(null);const W=690,H=210,L=42,R=18,T=18,B=33;const x=i=>L+(i+.5)*(W-L-R)/buckets.length;const y=r=>T+(H-T-B)*(1-r/100);
 const valid=buckets.map((b,i)=>({b,i})).filter(({b})=>b.rate!==null);
 const lines=[];let current=[];for(let i=0;i<buckets.length;i++){const b=buckets[i];if(b.rate===null){if(current.length)lines.push(current);current=[];}else current.push([x(i),y(b.rate)]);}if(current.length)lines.push(current);
 useGSAP(()=>{
   if(window.matchMedia('(prefers-reduced-motion: reduce)').matches || !chart.current)return;
   const columns=chart.current.querySelectorAll('.chart-column');
   const lines=chart.current.querySelectorAll('.chart-line');
   const dots=chart.current.querySelectorAll('.chart-dot');
   const timeline=gsap.timeline();
   timeline.fromTo(columns,{scaleY:0,transformOrigin:'bottom center'},
     {scaleY:1,duration:.95,stagger:.04,ease:'power3.out'});
   Array.from(lines).forEach((line)=>{
     const length=line.getTotalLength();
     gsap.set(line,{strokeDasharray:length,strokeDashoffset:length});
     timeline.to(line,{strokeDashoffset:0,duration:1.05,ease:'power2.out'},.18);
   });
   timeline.fromTo(dots,{scale:0,transformOrigin:'center center'},
     {scale:1,duration:.32,stagger:.035,ease:'back.out(2)'},.65);
 },{scope:chart,dependencies:[buckets],revertOnUpdate:true});
 return <svg ref={chart} className="analytics-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Attendance rates by class session, calculated from recorded check-ins">
  <defs><linearGradient id="graphGradient" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#31af90" stopOpacity=".80"/><stop offset=".68" stopColor="#8cddba" stopOpacity=".55"/><stop offset="1" stopColor="#d7f7bd" stopOpacity=".30"/></linearGradient></defs>
  {[0,25,50,75,100].map(n=><g key={n}><line className="graph-grid" x1={L} x2={W-R} y1={y(n)} y2={y(n)}/><text className="graph-label" x={L-10} y={y(n)+4} textAnchor="end">{n}%</text></g>)}
  {buckets.map((b,i)=><g key={i}><rect className="chart-column" x={x(i)-Math.min(27,(W-L-R)/buckets.length*.32)} y={y(b.rate||0)} width={Math.min(54,(W-L-R)/buckets.length*.64)} height={y(0)-y(b.rate||0)} rx="8" fill="url(#graphGradient)"/><text className="graph-label" x={x(i)} y={H-12} textAnchor="middle">{b.label}</text></g>)}
  {lines.map((ln,i)=><polyline key={i} className="chart-line" fill="none" stroke="var(--mint)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={ln.map(p=>p.join(',')).join(' ')}/>)}
  {valid.map(({b,i})=><circle key={i} className="chart-dot" cx={x(i)} cy={y(b.rate)} r="4.5" stroke="var(--card-solid)" strokeWidth="2.5" fill="var(--mint)"><title>{b.present} of {b.expected} check-ins ({b.rate}%)</title></circle>)}
 </svg>;
}

export function Overview() {
 const {data,perform}=useSession();
 const [approvalBusy,setApprovalBusy]=useState(null);
 const [approvalError,setApprovalError]=useState('');
 const approveStudent=async (profile)=>{
   if(!window.confirm(`Approve ${fullName(profile)} for StudentMonitor?`))return;
   setApprovalBusy(profile.user_id);setApprovalError('');
   try{
     await perform(()=>rpc('set_student_approval',{p_student_id:profile.user_id,p_approved:true}));
   } catch(e){ setApprovalError(e.message||'Unable to approve this student'); }
   finally{setApprovalBusy(null);}
 };

 const [range,setRange]=useState(7);
 const [selected,setSelected]=useState(null);
 const {focusedPanel,gridRef,toggleFocus}=useDashboardFocus();
 const clock=manilaClock();
 const approved=data.profiles.filter(p=>p.is_approved), pending=data.profiles.filter(p=>!p.is_approved);
 const todays=data.schedules.filter(s=>Number(s.weekday)===clock.weekday).sort(scheduleSort);
 const open=todays.filter(s=>openFor(s,data,clock)).length;
 const rows=buildMeetingReport(data,{date:clock.date});
 const summary=summarizeMeetingReport(rows);
 const buckets=useMemo(()=>attendanceTrend(data,clock.date,range),[data,clock.date,range]);
 const sum=buckets.reduce((a,b)=>({expected:a.expected+b.expected,present:a.present+b.present}),{present:0,expected:0});
 const rate=sum.expected?((sum.present/sum.expected)*100).toFixed(1)+'%':'—';
 
 const cards=[
  {label:'Total students',value:data.profiles.length,note:`${approved.length} approved students`,icon:UsersRound,tone:'mint'},
  {label:'Check-ins today',value:summary.present,note:`${summary.expected} expected across opened sessions`,icon:CheckCircle2,tone:'green'},
  {label:'Open attendance',value:open,note:`${todays.length} classes scheduled today`,icon:CalendarClock,tone:'gold'},
  {label:'Pending approvals',value:pending.length,note:'Profiles waiting for review',icon:Clock3,tone:'rose'}
 ];

 const isFocused=id=>focusedPanel===id;
 const panelProps=id=>({
   id:`overview-${id}`, 'data-dashboard-panel':true, 'data-flip-id':`overview-${id}`,
   className:`bento-panel ${id}-panel ${isFocused(id)?'is-expanded':''}`,
 });
 const focusAction=(id,label)=><FocusButton panel={id} label={label} expanded={isFocused(id)} onClick={toggleFocus}/>;

 return <MotionPage className="classroom-overview">
  <Title eyebrow={`ADMIN OVERVIEW · ${clock.date} · PH TIME`}
   description="A clear view of your classes, attendance, and student activity."
   actions={<div className="quick-actions">
    <Link className="btn primary" to="/admin/classes"><CalendarCheck size={16}/>Open attendance</Link>
    <Link className="btn subtle" to="/admin/students?approval=pending"><UsersRound size={16}/>Approve students</Link>
    <Link className="btn subtle" to="/admin/reports"><Download size={16}/>Export report</Link>
   </div>}>Your classroom, at a glance <span className="wave">✦</span></Title>
  <RevealList className="stats-grid">{cards.map(c=><StatCard key={c.label} icon={c.icon} title={c.label} value={c.value} note={c.note} tone={c.tone}/>)}</RevealList>
  <div ref={gridRef} className={`dashboard-bento ${focusedPanel?'has-focus':''}`} data-focused-panel={focusedPanel||'none'}>
   <Card {...panelProps('analytics')} className={`${panelProps('analytics').className} analytics-panel`}>
    <PanelTitle icon={BarChart3} title="Attendance at a glance" subtitle="Check-in trends from your opened class sessions."
     action={<div className="panel-actions-inline">
      <div className="segmented" aria-label="Chart date range">{[7,30,90].map(n=><button key={n} type="button" className={range===n?'active':''} aria-pressed={range===n} onClick={()=>setRange(n)}>{n}D</button>)}</div>
      {focusAction('analytics','attendance analytics')}
     </div>}/>
    <div className="chart-layout"><div className="chart-container"><AttendanceGraph buckets={buckets}/>{!sum.expected&&<p className="muted chart-caption">No opened class meetings in this period yet.</p>}</div>
     <div className="chart-summary"><div><span>Attendance rate</span><strong>{rate}</strong><small>{sum.present} / {sum.expected} expected</small></div><div><span>Recorded check-ins</span><strong>{sum.present}</strong></div><div><span>Not checked in</span><strong>{Math.max(0,sum.expected-sum.present)}</strong><small>Not automatically absent</small></div></div></div>
    {isFocused('analytics')&&<div className="panel-focus-content">
      <div className="panel-focus-intro"><div><span className="focus-eyebrow">DETAILED TREND</span><h3>Daily attendance breakdown</h3><p>Based on attendance windows actually opened for class.</p></div><Link className="btn subtle tiny" to="/admin/reports">Open reports <ArrowRight size={15}/></Link></div>
      <div className="trend-breakdown">{buckets.slice(-14).map((b,i)=><div className="trend-day" key={`${i}-${b.label}`}><span>{b.label}</span><div className="trend-progress" role="img" aria-label={`${b.label}: ${b.present} of ${b.expected} check-ins`}><span style={{width:`${b.rate??0}%`}}/></div><strong>{b.rate===null?'No sessions':`${b.rate}%`}</strong><small>{b.present}/{b.expected}</small></div>)}</div>
    </div>}
   </Card>

   <Card {...panelProps('classes')}>
    <PanelTitle icon={CalendarDays} title="Today’s class windows" subtitle={`${todays.length} scheduled meetings today`}
     action={<div className="panel-actions-inline"><Link className="text-action" to="/admin/classes">View all <ArrowRight size={15}/></Link>{focusAction('classes','class windows')}</div>}/>
    <div className="class-window-list">{todays.map(s=>{
      const w=todayWindow(s,data.windows,clock);
      const isOpen=openFor(s,data,clock);
      const status=isOpen?'Open':w?'Closed':classInProgress(s,clock)?'Ready':'Scheduled';
      return <Link to="/admin/classes" key={s.id} className="class-window-row">
        <span className="class-window-time">{timeLabel(s.start_time)}</span>
        <span className="class-window-description"><strong>{subject(data,s.subject_id)} <span>· Section {section(data,s.section_id)}</span></strong><small>{timeFor(s)} · Philippine time</small></span>
        <Badge tone={isOpen?'good':status==='Ready'?'warn':'muted'}>{status}</Badge>
      </Link>;
    })}{!todays.length&&<Empty>No classes scheduled today.</Empty>}</div>
    {isFocused('classes')&&<div className="panel-focus-content"><div className="panel-focus-intro"><div><span className="focus-eyebrow">CLASS STATUS</span><h3>Today's teaching schedule</h3><p>All times use Asia/Manila; check-in opens only during the assigned class period.</p></div><Link className="btn subtle tiny" to="/admin/classes">Manage attendance <ArrowRight size={15}/></Link></div>
      <div className="focus-class-list">{todays.map(s=><div key={s.id} className="focus-class-row"><div><strong>Section {section(data,s.section_id)} · {subject(data,s.subject_id)}</strong><small>{timeFor(s)}</small></div><span>{approved.filter(p=>Number(p.section_id)===Number(s.section_id)).length} approved students</span><Badge tone={openFor(s,data,clock)?'good':'muted'}>{openFor(s,data,clock)?'Open':'Not open'}</Badge></div>)}{!todays.length&&<Empty>No meetings scheduled for today.</Empty>}</div>
    </div>}
   </Card>

   <Card {...panelProps('students')}>
    <PanelTitle icon={UsersRound} title="Recent student approvals" subtitle="Student profiles waiting for your review"
     action={<div className="panel-actions-inline"><Link className="text-action" to="/admin/students?approval=pending">View all <ArrowRight size={15}/></Link>{focusAction('students','student approvals')}</div>}/>
    <PageAlert message={approvalError} onClose={()=>setApprovalError('')}/>
    <div className="approval-preview-list">{pending.slice(0,isFocused('students')?10:3).map((p,i)=><div className="approval-preview-row" key={p.user_id}>
      <span className={`mini-avatar hue-${i%4}`} aria-hidden="true">{initials(p)}</span>
      <span className="approval-student"><strong>{fullName(p)}</strong><small>Section {section(data,p.section_id)} · {subject(data,p.subject_id)}</small></span>
      <span className="approval-github">@{p.github_username}</span>
      <div className="approval-buttons"><button type="button" className="btn tiny subtle" onClick={()=>setSelected(p)}>Review</button><button type="button" className="btn tiny primary" disabled={!!approvalBusy} onClick={()=>approveStudent(p)}>{approvalBusy===p.user_id?'Approving…':'Approve'}</button></div>
    </div>)}{!pending.length&&<Empty>No student profiles awaiting approval.</Empty>}</div>
    {isFocused('students')&&<div className="panel-focus-content"><p className="muted">Showing up to ten pending profiles. Review their verified GitHub identity and class details before approval.</p><Link className="btn subtle tiny" to="/admin/students?approval=pending">Manage student applications <ArrowRight size={15}/></Link></div>}
   </Card>

   <Card {...panelProps('activity')}>
    <PanelTitle icon={Activity} title="Activity log" subtitle="Recent actions in your workspace"
     action={<div className="panel-actions-inline"><Link className="text-action" to="/admin/audit">View all <ArrowRight size={15}/></Link>{focusAction('activity','activity log')}</div>}/>
    <div className="activity-preview-list">{data.audit.slice(0,isFocused('activity')?15:3).map(l=>{
      const label=String(l.action).replaceAll(/[._-]/g,' ');
      const EventIcon=/approv/i.test(label)?CheckCircle2:/attend|window|class/i.test(label)?CalendarCheck:UsersRound;
      return <div className="activity-preview-row" key={l.id}><span className="activity-preview-icon"><EventIcon size={17}/></span><span className="activity-preview-description"><strong>{label}</strong><small>{l.subject_user_id?fullName(data.profiles.find(p=>p.user_id===l.subject_user_id)||{})||'Student profile':'System activity'}</small></span><time>{readableTime(l.created_at)}</time></div>;
    })}{!data.audit.length&&<Empty>No activity has been recorded yet.</Empty>}</div>
    {isFocused('activity')&&<div className="panel-focus-content"><div className="panel-focus-intro"><div><span className="focus-eyebrow">ADMIN AUDIT</span><h3>All recent events</h3><p>These entries are stored by Supabase, not created by frontend animations.</p></div><Link className="btn subtle tiny" to="/admin/audit">Full activity log <ArrowRight size={15}/></Link></div></div>}
   </Card>
  </div>
  <p className="footnote">Attendance rates are based on currently approved students and opened class windows. Historical roster changes can affect past rates.</p>
  {selected&&<StudentDrawer profile={selected} data={data} onClose={()=>setSelected(null)}/>}
 </MotionPage>;
}

function StudentDrawer({profile:p,data,onClose,onUpdated}){const {perform}=useSession();const [editing,setEditing]=useState(false);const [sec,setSec]=useState(String(p.section_id)),[sub,setSub]=useState(String(p.subject_id)),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const allowed=new Set(data.sectionSubjects.filter(s=>Number(s.section_id)===Number(sec)).map(s=>Number(s.subject_id)));
 async function execute(action){setBusy(true);setError('');try{await perform(action);onUpdated?.();onClose();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <Modal drawer title={fullName(p)} subtitle={`@${p.github_username} · Student profile`} onClose={onClose}><PageAlert message={error}/><div className="drawer-profile"><div className="large-avatar">{initials(p)}</div><div><h3>{fullName(p)}</h3><p>Section {section(data,p.section_id)} · {subject(data,p.subject_id)}</p><Badge tone={p.is_approved?'good':'warn'}>{p.is_approved?'Approved':'Pending approval'}</Badge></div></div>
 <div className="detail-grid"><span>Surname<strong>{p.surname}</strong></span><span>First name<strong>{p.first_name}</strong></span><span>Middle initial<strong>{p.middle_initial}</strong></span><span>Sex<strong>{p.sex}</strong></span><span>Age<strong>{p.age}</strong></span><span>GitHub<strong>@{p.github_username}</strong></span><span>Student number<strong>{p.student_number || 'Not linked to official roster'}</strong></span></div>
 <div className="drawer-actions"><button className={`btn ${p.is_approved?'subtle':'primary'}`} disabled={busy} onClick={()=>{if(window.confirm(`${p.is_approved?'Revoke approval for':'Approve'} ${fullName(p)}?`))execute(()=>rpc('set_student_approval',{p_student_id:p.user_id,p_approved:!p.is_approved}));}}>{p.is_approved?'Revoke approval':'Approve student'}</button><button className="btn outline" onClick={()=>setEditing(!editing)}>Edit assignment</button></div>
 {editing&&<form className="drawer-form" onSubmit={e=>{e.preventDefault();if(!window.confirm('Update the approved section and subject?'))return;execute(()=>rpc('admin_update_student_assignment',{p_student_id:p.user_id,p_section_id:Number(sec),p_subject_id:Number(sub)}));}}><label>Section<select value={sec} onChange={e=>{setSec(e.target.value);setSub('');}} required>{data.sections.map(s=><option value={s.id} key={s.id}>{s.code}</option>)}</select></label><label>Primary subject<select value={sub} onChange={e=>setSub(e.target.value)} required><option value="">Choose subject</option>{data.subjects.filter(s=>allowed.has(Number(s.id))).map(s=><option key={s.id} value={s.id}>{s.code}</option>)}</select></label><button disabled={busy||!sub} className="btn primary" type="submit">Save assignment</button></form>}
 </Modal>;
}

export function StudentsPage(){const {data}=useSession();const [params]=useSearchParams();const [search,setSearch]=useState(params.get('q')||''),[sec,setSec]=useState(''),[approval,setApproval]=useState(params.get('approval')||''),[selected,setSelected]=useState(null);
 useEffect(()=>{setSearch(params.get('q')||'');setApproval(params.get('approval')||'');},[params]);
 const rows=data.profiles.filter(p=>(`${p.first_name} ${p.surname} ${p.github_username}`).toLowerCase().includes(search.toLowerCase())&&(!sec||String(p.section_id)===sec)&&(!approval||(approval==='approved'?p.is_approved:!p.is_approved))).sort((a,b)=>Number(a.is_approved)-Number(b.is_approved)||a.surname.localeCompare(b.surname));
 return <MotionPage><Title eyebrow="STUDENT MANAGEMENT" description={`${data.profiles.length} registered profiles · ${data.profiles.filter(p=>!p.is_approved).length} awaiting approval`}>Students & approvals</Title><Card><div className="filter-row"><label><span>Search by name or GitHub</span><div className="input-with-icon"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search student…"/></div></label><label><span>Section</span><select value={sec} onChange={e=>setSec(e.target.value)}><option value="">All sections</option>{data.sections.map(s=><option key={s.id} value={s.id}>{s.code}</option>)}</select></label><label><span>Profile status</span><select value={approval} onChange={e=>setApproval(e.target.value)}><option value="">All profiles</option><option value="pending">Pending</option><option value="approved">Approved</option></select></label></div>
 <DataTable columns={['Student','Section','Subject','Status','Details']} rows={rows.map((p,i)=><tr key={p.user_id}><td><div className="person"><span className={`mini-avatar hue-${i%4}`}>{initials(p)}</span><div><strong>{fullName(p)}</strong><small>@{p.github_username}</small></div></div></td><td>{section(data,p.section_id)}</td><td>{subject(data,p.subject_id)}</td><td><Badge tone={p.is_approved?'good':'warn'}>{p.is_approved?'Approved':'Pending'}</Badge></td><td><button className="btn tiny outline" onClick={()=>setSelected(p)}>View / Manage <ArrowRight size={14}/></button></td></tr>)} empty="No student profiles match these filters."/><p className="footnote">Only approve students you recognize. Account and class changes are audited in Supabase.</p></Card>
 {data.rosterReady && <Card>
   <PanelTitle icon={UsersRound} title="Official student roster" subtitle={`${data.roster.length} imported students · registration not required to appear here`}/>
   <div className="roster-v61-intro">The official class list is separate from GitHub registrations. Students missing an account can still appear in daily attendance reports.</div>
   <DataTable columns={['Student number','Official full name','Section','Account']} rows={data.roster
     .filter(r=>(!sec||String(r.section_id)===sec) && `${r.student_number} ${r.full_name}`.toLowerCase().includes(search.toLowerCase()))
     .map(r=>{const registered=data.profiles.find(p=>p.student_number===r.student_number || p.user_id===r.linked_user_id);return <tr key={r.student_number}>
       <td className="roster-v61-number">{r.student_number}</td><td><strong>{r.full_name}</strong>{r.name_needs_review&&<small className="roster-v61-needs-review">Verify name formatting</small>}</td>
       <td>{section(data,r.section_id)}</td><td><Badge tone={registered ? 'good' : 'muted'}>{registered ? 'Registered' : 'Not registered'}</Badge></td>
     </tr>})} empty="No students found in the imported roster for these filters."/>
   <p className="footnote">Only administrators can read student numbers and the complete imported roster. Check flagged names against the original sheets.</p>
 </Card>}
 {!data.rosterReady && <p className="roster-v61-warning">Official roster unavailable: apply Supabase migration 004 and the separate private import.</p>}
 {selected&&<StudentDrawer profile={selected} data={data} onClose={()=>setSelected(null)}/>}</MotionPage>;
}

function ClassControl({schedule:s,data,showDay=true}){const {perform}=useSession();const [busy,setBusy]=useState(false);const [error,setError]=useState('');const clock=manilaClock();const win=todayWindow(s,data.windows,clock);const active=openFor(s,data,clock);const inClass=classInProgress(s,clock);const status=active?'Open':win?'Closed / expired':inClass?'Ready':'Scheduled';
 async function execute(){if(!window.confirm(`${active?'Close':'Open'} attendance for Section ${section(data,s.section_id)}, ${subject(data,s.subject_id)}?`))return;setBusy(true);setError('');try{await perform(()=>rpc(active?'close_class_attendance':'open_class_attendance',{p_schedule_id:Number(s.id)}));}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <div className="schedule-card"><div className="schedule-primary"><div className="schedule-symbol"><GraduationCap size={20}/></div><div><strong>Section {section(data,s.section_id)}</strong><small>{subject(data,s.subject_id)}</small></div></div><div className="schedule-details">{showDay&&<span>{weekdayLabel(s.weekday)}</span>}<span>{timeFor(s)}</span></div><Badge tone={active?'good':inClass&&!win?'warn':'muted'}>{status}</Badge><button type="button" className={`btn ${active?'outline':'primary'} tiny`} disabled={busy||(!active&&!inClass)} onClick={execute}>{busy?'Working…':active?'Close attendance':'Open attendance'}</button>{error&&<p className="inline-error" role="alert">{error}</p>}</div>;
}
export function ClassesPage(){const {data,refreshData,refreshing}=useSession();const [day,setDay]=useState('all');const records=[...data.schedules].sort(scheduleSort).filter(s=>day==='all'||Number(s.weekday)===Number(day));
 return <MotionPage><Title eyebrow="CLASS SCHEDULES" description="Actual class times use Asia/Manila. Open or close a meeting only during its scheduled period." actions={<button className="btn subtle" onClick={refreshData} disabled={refreshing}><RefreshCw size={17}/>Refresh</button>}>Classes & check-in windows</Title><Card><div className="filter-row"><label><span>View timetable</span><select value={day} onChange={e=>setDay(e.target.value)}><option value="all">All weekdays</option>{[1,2,3,4,5].map(d=><option key={d} value={d}>{weekdayLabel(d)}</option>)}</select></label><span className="muted filter-label">{records.length} scheduled meetings</span></div><div className="schedule-list">{records.map(s=><ClassControl key={s.id} schedule={s} data={data}/>)}</div><p className="footnote">If a class has not started yet, the Open button remains disabled. The database also enforces this restriction.</p></Card></MotionPage>;
}
export function AttendancePage(){const {data,refreshData,refreshing}=useSession();const clock=manilaClock();const today=data.schedules.filter(s=>Number(s.weekday)===clock.weekday).sort(scheduleSort);const report=buildMeetingReport(data,{date:clock.date});const summary=summarizeMeetingReport(report);
 return <MotionPage><Title eyebrow="LIVE ATTENDANCE" description={`Today's class meetings · ${clock.date} · Philippine time`} actions={<button className="btn subtle" onClick={refreshData} disabled={refreshing}><RefreshCw size={16}/>Refresh</button>}>Attendance monitor</Title><div className="stats-grid"><StatCard icon={CalendarDays} title="Scheduled classes" value={today.length} note="Meetings today"/><StatCard icon={CalendarClock} title="Opened sessions" value={summary.meetings} note="Windows created today" tone="gold"/><StatCard icon={CheckCircle2} title="Checked in" value={summary.present} note={`${summary.expected} expected check-ins`} tone="green"/><StatCard icon={Clock3} title="Not checked in" value={summary.unrecorded} note="Not an absence classification" tone="rose"/></div>
 <Card><PanelTitle icon={CalendarCheck} title="Class controls" subtitle="Open attendance during the correct scheduled meeting"/><div className="schedule-list">{today.map(s=><ClassControl key={s.id} schedule={s} data={data} showDay={false}/>)}{!today.length&&<Empty>No classes scheduled today.</Empty>}</div></Card>
 <Card><PanelTitle icon={UsersRound} title="Today's check-ins" subtitle="Read-only register of opened class windows"/><DataTable columns={['Student','Section','Subject','Status']} rows={report.slice(0,200).map((r,i)=><tr key={r.windowId+':'+r.studentId}><td>{r.student}</td><td>{r.section}</td><td>{r.subject}</td><td><Badge tone={r.status==='Present'?'good':'warn'}>{r.status}</Badge></td></tr>)} empty="No class attendance windows opened yet."/></Card></MotionPage>;
}

function downloadCsv(filename,csv){const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function ReportsPage() {
  const { data, refreshData, refreshing } = useSession();
  const clock = manilaClock();
  const [date, setDate] = useState(clock.date);
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [view, setView] = useState(data.rosterReady === false ? 'sessions' : 'daily');
  const dailyRows = useMemo(() => buildDailyRosterReport(data, {date, sectionId, subjectId}),
    [data, date, sectionId, subjectId]);
  const sessionRows = useMemo(() => buildMeetingReport(data, {date, sectionId, subjectId}),
    [data, date, sectionId, subjectId]);
  const rows = view === 'daily' ? dailyRows : sessionRows;
  const summary = view === 'daily' ? summarizeDailyRoster(dailyRows) : summarizeMeetingReport(sessionRows);
  const isDaily = view === 'daily';
  return <MotionPage>
    <Title eyebrow="ATTENDANCE REPORTS" description="Choose a date and see the official class list, recorded check-ins and students who did not check in."
      actions={<button className="btn subtle" onClick={refreshData} disabled={refreshing}><RefreshCw size={16}/>Refresh</button>}>
      Reports & exports
    </Title>
    <Card>
      <div className="roster-v61-report-tabs" aria-label="Report type">
        <button type="button" className={isDaily?'is-selected':''} aria-pressed={isDaily} onClick={()=>setView('daily')} disabled={!data.rosterReady}>
          Daily class register
        </button>
        <button type="button" className={!isDaily?'is-selected':''} aria-pressed={!isDaily} onClick={()=>setView('sessions')}>
          Opened sessions
        </button>
      </div>
      {!data.rosterReady && <p className="roster-v61-warning">Apply migration 004 and your PRIVATE roster import to enable daily class registers. Existing session reports are still available.</p>}
      <p className="roster-v61-description">{isDaily
        ? 'Includes every official roster student for classes scheduled on this date, even if they have not created a GitHub account.'
        : 'Shows attendance for class sessions that the instructor actually opened.'}</p>
      <div className="filter-row">
        <label><span>Class date (Philippine time)</span><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
        <label><span>Section</span><select value={sectionId} onChange={e=>setSectionId(e.target.value)}>
          <option value="">All sections</option>{data.sections.map(s=><option key={s.id} value={s.id}>{s.code}</option>)}
        </select></label>
        <label><span>Subject</span><select value={subjectId} onChange={e=>setSubjectId(e.target.value)}>
          <option value="">All subjects</option>{data.subjects.map(s=><option key={s.id} value={s.id}>{s.code}</option>)}
        </select></label>
        <button className="btn primary" disabled={!rows.length} onClick={()=>downloadCsv(`student-${isDaily?'daily-register':'attendance'}-${date}.csv`,isDaily?toDailyRosterCsv(rows):toCsv(rows))}>
          <Download size={18}/>Export CSV
        </button>
      </div>
      <div className="report-metrics">
        <div>{isDaily?'Scheduled meetings':'Opened meetings'}<strong>{summary.meetings}</strong></div>
        <div>Expected students<strong>{summary.expected}</strong></div>
        <div>Present<strong>{summary.present}</strong></div>
        <div>Not checked in<strong>{summary.unrecorded}</strong></div>
      </div>
      {isDaily && <div className="roster-v61-status-explainer">
        <span><strong>{summary.notOpened}</strong> Not opened — instructor did not open attendance</span>
        <span><strong>{summary.waiting}</strong> Open / waiting — check-in window still active</span>
      </div>}
      {isDaily ? <DataTable
        columns={['Date','Section / Subject','Student number','Official full name','Account','Attendance']}
        rows={rows.slice(0,750).map((r,i)=><tr key={`${r.scheduleId}:${r.studentNumber||r.student}:${i}`}>
          <td>{r.date}<small className="roster-v61-time">{r.time} PHT</small></td>
          <td>{r.section}<small className="roster-v61-time">{r.subject}</small></td>
          <td className="roster-v61-number">{r.studentNumber||'Unlinked account'}</td>
          <td><strong>{r.student}</strong>{r.needsReview&&<small className="roster-v61-needs-review">Verify official spelling</small>}</td>
          <td><Badge tone={r.account==='Approved'?'good':'muted'}>{r.account}</Badge></td>
          <td><Badge tone={r.status==='Present'?'good':r.status==='Open / waiting'?'warn':'muted'}>{r.status}</Badge></td>
        </tr>)} empty="No classes scheduled for that date or no students match these filters."/>
       : <DataTable columns={['Date','Section','Subject','Student','GitHub','Status']}
        rows={rows.slice(0,750).map((r,i)=><tr key={`${r.windowId}:${r.studentId}:${i}`}>
          <td>{r.date}</td><td>{r.section}</td><td>{r.subject}</td><td><strong>{r.student}</strong></td>
          <td>@{r.github}</td><td><Badge tone={r.status==='Present'?'good':r.status==='Open / waiting'?'warn':'muted'}>{r.status}</Badge></td>
        </tr>)} empty="No matching class attendance windows were opened."/>}
      {rows.length>750 && <p className="footnote">Showing the first 750 rows. CSV export includes all {rows.length} rows.</p>}
      <p className="footnote">“Not checked in” means no recorded check-in after an opened meeting; it is not automatically an unexcused absence. “Not opened” is shown separately. Historical rosters reflect the currently imported class list, not enrollment changes over time.</p>
    </Card>
  </MotionPage>;
}
export function ActivityPage(){const {data}=useSession();const names=new Map(data.profiles.map(p=>[p.user_id,fullName(p)]));return <MotionPage><Title eyebrow="ADMIN ACTIVITY" description="Latest profile, approval, attendance and assignment changes.">Activity log</Title><Card><DataTable columns={['Timestamp (PH)','Action','Student','Details']} rows={data.audit.map(l=><tr key={l.id}><td>{readableTime(l.created_at)}</td><td><strong>{l.action}</strong></td><td>{names.get(l.subject_user_id)||l.subject_user_id||'—'}</td><td className="detail-cell">{l.details&&Object.keys(l.details).length?JSON.stringify(l.details):'—'}</td></tr>)} empty="No recorded actions yet."/><p className="footnote">Showing the most recent 150 audit events.</p></Card></MotionPage>}
