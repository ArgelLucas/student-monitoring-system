import React,{useEffect} from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './state/SessionProvider.jsx';
import { LoginPage, ProfilePage, PendingPage, StudentHome, StudentAttendance, StudentLayout } from './pages/StudentPages.jsx';
import { AdminLayout, Overview, StudentsPage, AttendancePage, ClassesPage, ReportsPage, ActivityPage } from './pages/AdminPages.jsx';
import { Card } from './components/UI.jsx';
import { ClassRecordsPage } from './pages/ClassRecordsPage.jsx';

function Landing(){const {context}=useSession();return <Navigate replace to={!context?'/login':context.admin?'/admin':!context.profile?'/profile':context.profile.is_approved?'/student':'/pending'}/>;}
function AdminGate(){const {context}=useSession();return context?.admin?<AdminLayout/>:<Landing/>;}
function StudentGate({children}){const {context}=useSession();if(!context || context.admin || !context.profile?.is_approved)return <Landing/>;return <StudentLayout>{children}</StudentLayout>;}
function ProfileGate(){const {context}=useSession();if(!context || context.admin)return <Landing/>;return <StudentLayout><ProfilePage/></StudentLayout>;}
function PendingGate(){const {context}=useSession();if(!context||context.admin||!context.profile||context.profile.is_approved)return <Landing/>;return <StudentLayout><PendingPage/></StudentLayout>;}
export default function App(){
  const {configured,initializing,error,reload,context,data}=useSession();
  const location=useLocation();
  useEffect(()=>{document.title='StudentMonitor · '+(location.pathname.split('/').filter(Boolean).at(-1)||'Home');},[location.pathname]);
  if(!configured)return <div className="center-screen"><Card><h2>Project configuration missing</h2><p>Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your .env, then restart Vite.</p></Card></div>;
  if(initializing)return <div className="center-screen"><span className="brand-icon">SM</span><p>Opening StudentMonitor…</p></div>;
  if(error && (!context || (context && (context.admin || context.profile?.is_approved) && !data)))return <div className="center-screen"><Card><h2>Could not load StudentMonitor</h2><p className="alert">{error}</p><button className="btn primary" onClick={()=>reload()}>Retry connection</button></Card></div>;
  return <Routes>
    <Route path="/" element={<Landing/>}/>
    <Route path="/login" element={!context?<LoginPage/>:<Landing/>}/>
    <Route path="/profile" element={<ProfileGate/>}/>
    <Route path="/pending" element={<PendingGate/>}/>
    <Route path="/student" element={<StudentGate><StudentHome/></StudentGate>}/>
    <Route path="/attendance" element={<StudentGate><StudentAttendance/></StudentGate>}/>
    <Route path="/admin" element={<AdminGate/>}>
      <Route index element={<Overview/>}/>
      <Route path="students" element={<StudentsPage/>}/>
      <Route path="attendance" element={<AttendancePage/>}/>
      <Route path="classes" element={<ClassesPage/>}/>
      <Route path="academic-classes" element={<Navigate replace to="/admin/classes"/>}/>
      <Route path="reports" element={<ReportsPage/>}/>
      <Route path="class-records" element={<ClassRecordsPage/>}/>
      <Route path="audit" element={<ActivityPage/>}/>
    </Route>
    <Route path="*" element={<Landing/>}/>
  </Routes>;
}
