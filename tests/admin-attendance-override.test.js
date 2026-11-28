import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {studentClassStatus,studentScheduleSummary} from '../src/lib/student-flow.js';
import {buildDailyRosterReport} from '../src/lib/daily-register.js';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const monday={date:'2026-11-30',weekday:1,minutes:600};
const tuesdayClass={id:7,section_id:1,subject_id:9,weekday:2,start_time:'09:00:00',end_time:'12:00:00'};
const windows=[{id:12,schedule_id:7,meeting_date:'2026-11-30',
  is_open:true,is_override:true,opened_at:'2026-11-30T01:00:00Z',
  expires_at:'2026-11-30T03:00:00Z'}];
const now=new Date('2026-11-30T02:00:00Z');
const data={schedules:[tuesdayClass],windows,attendance:[]};

test('active forced session is available on a non-scheduled weekday',()=>{
  const state=studentClassStatus(tuesdayClass,data,monday,now);
  assert.equal(state.canCheckIn,true);
  assert.equal(state.key,'open');
  assert.equal(state.label,'Extra check-in open');
  const summary=studentScheduleSummary(data,monday,now);
  assert.equal(summary.today.length,1);
  assert.equal(summary.open,1);
});
test('override expires and never allows check-in outside active window',()=>{
  const expired=new Date('2026-11-30T03:00:00Z');
  assert.equal(studentClassStatus(tuesdayClass,data,monday,expired).canCheckIn,false);
  assert.equal(studentClassStatus(tuesdayClass,{...data,windows:windows.map(w=>({...w,is_override:false}))},monday,now).canCheckIn,false);
  assert.equal(studentClassStatus(tuesdayClass,{...data,windows:windows.map(w=>({...w,is_open:false}))},monday,now).canCheckIn,false);
});
test('recorded check-in takes precedence over an active override',()=>{
  const state=studentClassStatus(tuesdayClass,{...data,attendance:[{attendance_window_id:12}]},monday,now);
  assert.equal(state.key,'recorded');
  assert.equal(state.canCheckIn,false);
});
test('extra session is included in daily register for actual date',()=>{
  const rows=buildDailyRosterReport({
    ...data,
    sections:[{id:1,code:'1A'}],subjects:[{id:9,code:'CT 123a'}],
    roster:[{student_number:'2026000001',section_id:1,full_name:'Example, Test',active:true}],
    profiles:[]
  },{date:'2026-11-30'},now);
  assert.equal(rows.length,1);
  assert.equal(rows[0].status,'Open / waiting');
});
test('admin override requires reason, short duration and protected SQL authorization',()=>{
  const sql=source('supabase/migrations/202611260006_attendance_override.sql');
  assert.match(sql,/public\.force_open_class_attendance/);
  assert.match(sql,/p_minutes NOT IN \(15,30,60\)/);
  assert.match(sql,/length\(v_reason\) < 10/);
  assert.match(sql,/NOT public\.portal_session_active\(\) OR NOT public\.is_admin\(\)/);
  assert.match(sql,/attendance\.window\.force_opened/);
  assert.match(sql,/IF NOT v_window\.is_override/);
  assert.match(sql,/s\.section_id=v_profile\.section_id/);
  assert.match(sql,/is_override=false/);
  assert.match(sql,/REVOKE ALL ON FUNCTION/);
  const admin=source('src/pages/AdminPages.jsx');
  assert.match(admin,/force_open_class_attendance/);
  assert.match(admin,/Force open/);
  assert.match(admin,/p_reason: reason/);
});
