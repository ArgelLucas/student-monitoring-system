import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMeetingReport, summarizeMeetingReport, toCsv } from '../src/lib/report.js';
import { adminStudentsScreen, adminClassesScreen, adminReportsScreen, adminAuditScreen } from '../src/pages/screens.js';

const migration = readFileSync(new URL('../supabase/migrations/202611250003_admin_reporting.sql', import.meta.url),'utf8');
const api = readFileSync(new URL('../src/lib/api.js', import.meta.url),'utf8');
const adminReact = readFileSync(new URL('../src/pages/AdminPages.jsx', import.meta.url),'utf8');
const data = {
  sections:[{id:1,code:'1A'},{id:2,code:'2B'}],
  subjects:[{id:11,code:'CT 123a'},{id:12,code:'CT 223a'}],
  sectionSubjects:[{section_id:1,subject_id:11},{section_id:2,subject_id:12}],
  profiles:[
    {user_id:'x',surname:'Alpha',first_name:'Ace',middle_initial:'A',github_username:'ace-alpha',section_id:1,subject_id:11,age:18,sex:'Male',is_approved:true},
    {user_id:'y',surname:'Beta',first_name:'Bee',middle_initial:'B',github_username:'bee-beta',section_id:1,subject_id:11,age:19,sex:'Female',is_approved:true},
    {user_id:'z',surname:'Gamma',first_name:'Gee',middle_initial:'G',github_username:'gee-gamma',section_id:2,subject_id:12,age:20,sex:'Female',is_approved:false},
  ],
  schedules:[{id:101,section_id:1,subject_id:11,weekday:2,start_time:'09:00:00',end_time:'12:00:00'},
    {id:102,section_id:2,subject_id:12,weekday:3,start_time:'16:00:00',end_time:'19:00:00'}],
  windows:[{id:201,schedule_id:101,meeting_date:'2026-11-24',is_open:false,opened_at:'2026-11-24T01:00:00Z',expires_at:'2026-11-24T04:00:00Z'},
    {id:202,schedule_id:102,meeting_date:'2026-11-25',is_open:true,opened_at:'2026-11-25T08:00:00Z',expires_at:'2026-11-25T11:00:00Z'}],
  attendance:[{student_id:'x',subject_id:11,attendance_window_id:201,attendance_date:'2026-11-24',status:'Present'}],
  audit:[{id:1,action:'student.approved',created_at:'2026-11-25T00:00:00Z',subject_user_id:'x',details:{}}],
};

test('attendance report counts only approved students in matching class and window',()=>{
  const rows=buildMeetingReport(data,{date:'2026-11-24'},new Date('2026-11-25T12:00:00Z'));
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(r=>r.status).sort(),['Not checked in','Present']);
  assert.equal(rows.every(r=>r.section==='1A' && r.subject==='CT 123a'),true);
  assert.deepEqual(summarizeMeetingReport(rows),{expected:2,present:1,waiting:0,unrecorded:1,meetings:1});
});

test('report date, section and subject filters do not leak other sections',()=>{
  assert.equal(buildMeetingReport(data,{date:'2026-11-24',sectionId:'2'},new Date()).length,0);
  assert.equal(buildMeetingReport(data,{date:'2026-11-24',subjectId:'12'},new Date()).length,0);
  assert.equal(buildMeetingReport(data,{date:'2026-11-24',sectionId:'1',subjectId:'11'},new Date()).length,2);
});

test('CSV export quotes cells and neutralizes spreadsheet formulas',()=>{
  const csv=toCsv([{date:'2026-11-24',section:'1A',subject:'CT 123a',student:'=HYPERLINK("bad")',github:'safeuser',status:'Present'}]);
  assert.match(csv,/"'=HYPERLINK\(""bad""\)"/);
  assert.match(csv,/Date,?"/);
  assert.match(csv,/"2026-11-24"/);
});

test('admin navigation screens support approvals, schedule controls, report and activity log',()=>{
  const ctx={admin:true};
  assert.match(adminStudentsScreen(ctx,data),/Approve/);
  assert.match(adminStudentsScreen(ctx,data),/Edit class assignment/);
  assert.match(adminClassesScreen(ctx,data),/Class timetable and attendance controls/);
  assert.match(adminReportsScreen(ctx,data,{date:'2026-11-24'}),/Export CSV/);
  assert.match(adminAuditScreen(ctx,data),/Recent account activity/);
});

test('admin assignment migration validates admin and class pairing',()=>{
  assert.match(migration,/public\.is_admin\(\)/);
  assert.match(migration,/public\.class_schedules/);
  assert.match(migration,/public\.student_profiles/);
  assert.match(migration,/public\.audit_logs/);
  assert.match(migration,/REVOKE ALL ON FUNCTION public\.admin_update_student_assignment/);
  assert.match(adminReact,/rpc\(["']admin_update_student_assignment["']/);
  assert.match(api,/fetchPaged/);
});
