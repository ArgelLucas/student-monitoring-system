import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDailyRosterReport,summarizeDailyRoster,isoWeekdayForDate,toDailyRosterCsv} from '../src/lib/daily-register.js';

const data={
  sections:[{id:1,code:'1A'},{id:2,code:'2A'}],
  subjects:[{id:11,code:'CT 123a'},{id:22,code:'CT 223a'}],
  schedules:[
    {id:5,weekday:5,section_id:1,subject_id:11,start_time:'15:00:00',end_time:'17:00:00'},
    {id:6,weekday:3,section_id:2,subject_id:22,start_time:'13:00:00',end_time:'15:00:00'}
  ],
  roster:[
    {student_number:'2026000001',section_id:1,surname:'First',first_name:'Alex',middle_initial:'A',full_name:'First, Alex A.',linked_user_id:'u1',active:true},
    {student_number:'2026000002',section_id:1,surname:'Second',first_name:'Bea',middle_initial:'B',full_name:'Second, Bea B.',linked_user_id:'u2',active:true},
    {student_number:'2026000003',section_id:1,surname:'Third',first_name:'Chris',middle_initial:'N/A',full_name:'Third, Chris',active:true},
    {student_number:'2026000004',section_id:2,surname:'Other',first_name:'Dan',middle_initial:'D',full_name:'Other, Dan D.',active:true},
  ],
  profiles:[{user_id:'u1',student_number:'2026000001',section_id:1,is_approved:true,github_username:'alex'},
    {user_id:'u2',student_number:'2026000002',section_id:1,is_approved:true,github_username:'bea'}],
  windows:[{id:31,schedule_id:5,meeting_date:'2026-11-27',opened_at:'2026-11-27T07:00:00Z',expires_at:'2026-11-27T09:00:00Z',is_open:false}],
  attendance:[{attendance_window_id:31,student_id:'u1',status:'Present'}]
};

test('weekday calculation is derived from the selected date and rejects invalid dates',()=>{
  assert.equal(isoWeekdayForDate('2026-11-27'),5);
  assert.equal(isoWeekdayForDate('2026-11-25'),3);
  assert.equal(isoWeekdayForDate('2026-02-30'),null);
  assert.equal(isoWeekdayForDate('garbage'),null);
});

test('Friday register includes every official roster student, even without GitHub registration',()=>{
  const rows=buildDailyRosterReport(data,{date:'2026-11-27'},new Date('2026-11-27T10:00:00Z'));
  assert.equal(rows.length,3);
  assert.equal(rows.find(r=>r.studentNumber==='2026000001').status,'Present');
  assert.equal(rows.find(r=>r.studentNumber==='2026000002').status,'Not checked in');
  const unregistered=rows.find(r=>r.studentNumber==='2026000003');
  assert.equal(unregistered.account,'Not registered');
  assert.equal(unregistered.status,'Not checked in');
  assert.deepEqual(summarizeDailyRoster(rows),{
    meetings:1,expected:3,present:1,unrecorded:2,waiting:0,notOpened:0,needsReview:0
  });
});

test('absence is not invented when the instructor never opened the attendance window',()=>{
  const rows=buildDailyRosterReport({...data,windows:[],attendance:[]},{date:'2026-11-27'});
  assert.equal(rows.length,3);
  assert.ok(rows.every(r=>r.status==='Not opened'));
  assert.equal(summarizeDailyRoster(rows).unrecorded,0);
});

test('filters select section and subject, and open windows show waiting not absent',()=>{
  const active={...data,windows:[{...data.windows[0],is_open:true}]};
  const rows=buildDailyRosterReport(active,{date:'2026-11-27',sectionId:'1',subjectId:'11'},new Date('2026-11-27T08:00:00Z'));
  assert.equal(rows.length,3);
  assert.equal(rows.filter(r=>r.status==='Open / waiting').length,2);
  assert.equal(buildDailyRosterReport(active,{date:'2026-11-27',sectionId:'2'},new Date()).length,0);
  assert.equal(buildDailyRosterReport(active,{date:'2026-11-25',sectionId:'2'},new Date()).length,1);
});

test('daily register CSV contains student number and neutralizes cell formulas',()=>{
  const rows=buildDailyRosterReport({...data,roster:[{...data.roster[0],full_name:'=BAD()'}]},
    {date:'2026-11-27'},new Date('2026-11-27T10:00:00Z'));
  const csv=toDailyRosterCsv(rows);
  assert.match(csv,/2026000001/);
  assert.match(csv,/"'=BAD\(\)"/);
  assert.match(csv,/Student number/);
});

test('schema hides student numbers from unauthenticated clients and looks up on the server',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/202611260004_student_roster_lookup.sql',import.meta.url),'utf8');
  const student=readFileSync(new URL('../src/pages/StudentPages.jsx',import.meta.url),'utf8');
  assert.match(sql,/ALTER TABLE public.student_roster ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/student_roster_admin_read/);
  assert.match(sql,/roster_lookup_attempts/);
  assert.match(sql,/public\.portal_session_active\(\)/);
  assert.match(sql,/SELECT \* INTO v_roster FROM public\.student_roster/);
  assert.match(sql,/Existing.*profile|Previously approved accounts require instructor identity linking/i);
  assert.match(student,/submit_roster_student_profile/);
  assert.match(student,/lookup_roster_student/);
});
