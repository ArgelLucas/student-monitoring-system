import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {monthDates,shiftCalendarMonth,getDateSessions,getMonthSessions,
 resolveStudentStatus,sessionRegisterRows,summarizeRegister,exportRegisterCsv}
 from '../src/lib/attendance-calendar.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('supabase/migrations/202611280008_attendance_calendar_register.sql');
const page=read('src/pages/AttendanceCalendarPage.jsx');
const api=read('src/lib/attendance-calendar-api.js');
const app=read('src/App.jsx');

const schedules=[
 {id:1,weekday:2,start_time:'09:00:00',end_time:'12:00:00',section_id:1,subject_id:11},
 {id:2,weekday:2,start_time:'13:00:00',end_time:'15:00:00',section_id:2,subject_id:22},
 {id:3,weekday:4,start_time:'10:00:00',end_time:'12:00:00',section_id:1,subject_id:33}
];
const base={
 schedules,sections:[{id:1,code:'1A'},{id:2,code:'2A'}],
 subjects:[{id:11,code:'CT 123a'},{id:22,code:'CT 223a'},{id:33,code:'QCA 113'}],
 windows:[],attendance:[],profiles:[]
};
const clock=new Date('2026-11-24T10:00:00Z');

test('month navigation includes actual calendar days and leap February',()=>{
 assert.equal(monthDates('2028-02').length,29);
 assert.equal(monthDates('2026-02').length,28);
 assert.equal(monthDates('2026-11')[0],'2026-11-01');
 assert.equal(monthDates('2026-11').at(-1),'2026-11-30');
 assert.equal(shiftCalendarMonth('2026-12',1),'2027-01');
 assert.equal(shiftCalendarMonth('2026-01',-1),'2025-12');
 assert.deepEqual(monthDates('bad'),[]); // invalid month produces empty collection
});
test('scheduled but unopened meetings are not absences',()=>{
 const rows=getDateSessions(base,'2026-11-24',{},clock);
 assert.equal(rows.length,2);
 assert.ok(rows.every(r=>r.status==='Scheduled · not opened'));
 assert.ok(rows.every(r=>r.windowId===null));
 assert.equal(getDateSessions(base,'2026-11-25').length,0);
});
test('open, finalized, cancelled and extra sessions remain distinct',()=>{
 const windows=[
 {id:9,schedule_id:1,meeting_date:'2026-11-24',is_open:true,opened_at:'2026-11-24T09:00:00Z',expires_at:'2026-11-24T11:00:00Z'},
 {id:10,schedule_id:3,meeting_date:'2026-11-24',is_open:false,is_override:true,opened_at:'2026-11-24T00:00:00Z',expires_at:'2026-11-24T01:00:00Z'}
 ];
 const data={...base,windows};
 let rows=getDateSessions(data,'2026-11-24',{},clock);
 assert.equal(rows.length,3);
 assert.equal(rows.find(s=>s.windowId===9).status,'Open');
 assert.equal(rows.find(s=>s.windowId===10).status,'Closed / expired');
 rows=getDateSessions(data,'2026-11-24',{9:{status:'Finalized'},10:{status:'Cancelled'}},clock);
 assert.equal(rows.find(s=>s.windowId===9).status,'Finalized');
 assert.equal(rows.find(s=>s.windowId===10).status,'Cancelled');
 assert.equal(getMonthSessions(data,'2026-11',{9:{status:'Finalized'}},clock).length,30);
});
test('historical real session survives later timetable weekday edits',()=>{
 const data={...base,windows:[{
  id:77,schedule_id:3,meeting_date:'2026-11-24',is_open:false,is_override:false,
  opened_at:'2026-11-24T01:00:00Z',expires_at:'2026-11-24T02:00:00Z'
 }]};
 const sessions=getDateSessions(data,'2026-11-24',{},clock);
 assert.ok(sessions.some(s=>s.windowId===77));
 assert.equal(sessions.find(s=>s.windowId===77).status,'Closed / expired');
});
test('explicit correction wins over check-in, but originals are unchanged',()=>{
 const entry={student_number:'2026000001',student_name_snapshot:'Test, Example',
   recorded_status:null,linked_user_id:'u1'};
 const attendance=[{student_id:'u1',attendance_window_id:9,status:'Present'}];
 assert.equal(resolveStudentStatus(entry,attendance,[],9),'Present');
 assert.equal(resolveStudentStatus({...entry,recorded_status:'Excused'},attendance,[],9),'Excused');
 assert.equal(resolveStudentStatus({...entry,recorded_status:'Late'},attendance,[],9),'Late');
 assert.equal(resolveStudentStatus({...entry,recorded_status:'Not Yet Recorded'},attendance,[],9),'Not Yet Recorded');
 assert.equal(resolveStudentStatus(entry,[],[],9),'Not Yet Recorded');
 assert.equal(attendance[0].status,'Present');
 const rows=sessionRegisterRows([entry],attendance,[],9);
 assert.deepEqual(summarizeRegister(rows),{total:1,Present:1,Late:0,Absent:0,Excused:0,'Not Yet Recorded':0});
});
test('linked user can be resolved through an approved roster profile',()=>{
 const entry={student_number:'2026000001',student_name_snapshot:'Test, Example',
   recorded_status:null,linked_user_id:null};
 assert.equal(resolveStudentStatus(entry,[{student_id:'u1',attendance_window_id:9}],
   [{user_id:'u1',student_number:'2026000001'}],9),'Present');
 assert.equal(resolveStudentStatus(entry,[{student_id:'u1',attendance_window_id:8}],
   [{user_id:'u1',student_number:'2026000001'}],9),'Not Yet Recorded');
});
test('CSV export includes status and neutralizes spreadsheet formulas',()=>{
 const csv=exportRegisterCsv([{student_number:'2026000001',student_name_snapshot:'=HYPERLINK("x")',
   status:'Absent',remarks:'+malicious'}],
 {date:'2026-11-24',section:'1A',subject:'CT 123a',sessionStatus:'Finalized'});
 assert.match(csv,/Finalized/);
 assert.match(csv,/Absent/);
 assert.match(csv,/'=HYPERLINK/);
 assert.match(csv,/'\+malicious/);
});
test('Phase 3 tables have admin-only RLS and no direct client writes',()=>{
 for(const t of ['attendance_session_reviews','attendance_register_entries']){
  assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS public\\.'+t));
  assert.match(sql,new RegExp('ALTER TABLE public\\.'+t+' ENABLE ROW LEVEL SECURITY'));
 }
 assert.match(sql,/GRANT SELECT ON public\.attendance_session_reviews,public\.attendance_register_entries/);
 assert.match(sql,/FOR SELECT TO authenticated USING \(\(SELECT public\.is_admin\(\)\)\)/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.seed_attendance_register/);
 for(const f of ['admin_prepare_attendance_register','admin_set_attendance_status',
  'admin_finalize_attendance_session','admin_cancel_attendance_session']){
  assert.match(sql,new RegExp('public\\.'+f));
  assert.match(api,new RegExp(f));
 }
});
test('never overwrite or delete original check-ins, and block reopens after finalization',()=>{
 assert.doesNotMatch(sql,/(DELETE|TRUNCATE)\s+FROM?\s+public\.attendance_records/i);
 assert.doesNotMatch(sql,/UPDATE\s+public\.attendance_records\s+SET/i);
 assert.match(sql,/NOT OLD\.is_open OR NEW\.opened_at IS DISTINCT FROM OLD\.opened_at/);
 assert.match(sql,/v\.status IN \('Finalized','Cancelled'\)/);
 assert.match(sql,/IF p_mark_absent THEN/);
 assert.match(sql,/Cannot mark absent while the check-in window is still active/);
 assert.match(sql,/Cannot finalize an empty official attendance register/);
 assert.match(sql,/Unmatched historical check-in/);
 assert.match(sql,/recorded_status='Not Yet Recorded'/);
 assert.match(sql,/e\.recorded_status IS NULL/);
 assert.match(sql,/NOT EXISTS\(\s*SELECT 1 FROM public\.attendance_records/);
 assert.match(sql,/attendance\.session\.finalized/);
 assert.match(sql,/attendance\.status\.corrected/);
 assert.match(sql,/attendance\.session\.cancelled/);
});
test('new admin Attendance route uses real calendar and not the legacy read-only screen',()=>{
 assert.match(app,/path="attendance" element=\{<AttendanceCalendarPage\/>\}/);
 assert.match(page,/loadSessionRegister\(/);
 assert.match(page,/getMonthSessions\(/);
 assert.match(page,/correctAttendanceStatus\(/);
 assert.match(page,/finalizeAttendanceSession\(/);
 assert.match(page,/cancelAttendanceSession\(/);
 assert.match(page,/exportRegisterCsv\(/);
 assert.match(page,/Not Yet Recorded/);
 assert.match(page,/window\.confirm/);
});
