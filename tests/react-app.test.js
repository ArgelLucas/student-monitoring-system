import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {attendanceTrend} from '../src/pages/legacy-trend.js';
import {buildMeetingReport,summarizeMeetingReport,toCsv} from '../src/lib/report.js';
import {manilaClock,classInProgress,windowIsOpen,weekdayLabel,timeLabel} from '../src/lib/schedule.js';
import {normalizeGitHubAccount} from '../src/lib/format.js';
const text=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const pages=text('../src/pages/AdminPages.jsx');
const student=text('../src/pages/StudentPages.jsx');
const provider=text('../src/state/SessionProvider.jsx');
const migration=text('../supabase/migrations/202611190002_schedule_attendance.sql');
const v3=text('../supabase/migrations/202611250003_admin_reporting.sql');
const data={
 sections:[{id:1,code:'1A'},{id:2,code:'2A'}],subjects:[{id:11,code:'CT 123a'},{id:12,code:'CT 223a'}],
 profiles:[{user_id:'x',surname:'Alpha',first_name:'Ace',middle_initial:'A',github_username:'ace-alpha',section_id:1,subject_id:11,is_approved:true},{user_id:'y',surname:'Beta',first_name:'Bee',github_username:'bee-beta',section_id:1,subject_id:11,is_approved:true},{user_id:'z',surname:'Gamma',first_name:'Gee',github_username:'gee-gamma',section_id:2,subject_id:12,is_approved:false}],
 schedules:[{id:101,section_id:1,subject_id:11,weekday:2,start_time:'09:00:00',end_time:'12:00:00'}],
 windows:[{id:201,schedule_id:101,meeting_date:'2026-11-24',is_open:false,opened_at:'2026-11-24T01:00:00Z',expires_at:'2026-11-24T04:00:00Z'}],
 attendance:[{id:1,student_id:'x',subject_id:11,attendance_window_id:201,attendance_date:'2026-11-24',status:'Present'}]
};
test('original six sections and fourteen meeting slots are retained in SQL migration',()=>{
 const entries=[...migration.matchAll(/\('([123][AB])','(CT 123a|CT 223a|QCA 113|CT 304)',[1-7],'\d\d:\d\d','\d\d:\d\d'\)/g)];
 assert.equal(entries.length,14);assert.equal(new Set(entries.map(m=>m[1])).size,6);
});
test('report only counts approved students for a given opened meeting',()=>{
 const r=buildMeetingReport(data,{date:'2026-11-24'},new Date('2026-11-25T12:00:00Z'));
 assert.equal(r.length,2);assert.deepEqual(r.map(r=>r.status).sort(),['Not checked in','Present']);
 assert.deepEqual(summarizeMeetingReport(r),{expected:2,present:1,waiting:0,unrecorded:1,meetings:1});
});
test('report filtering excludes unrelated subjects and sections',()=>{
 assert.equal(buildMeetingReport(data,{date:'2026-11-24',sectionId:'2'}).length,0);
 assert.equal(buildMeetingReport(data,{date:'2026-11-24',subjectId:'12'}).length,0);
});
test('analytics calculates a true 50% check-in rate with zero-data gaps',()=>{
 const buckets=attendanceTrend(data,'2026-11-24',7);
 assert.equal(buckets.at(-1).rate,50);assert.equal(buckets[0].rate,null);
 assert.equal(attendanceTrend(data,'2026-11-24',30).length,6);
});
test('spreadsheet formula injection is neutralized',()=>{
 const csv=toCsv([{date:'2026-11-24',section:'1A',subject:'CT 123a',student:'=IMPORTXML("evil")',github:'tester',status:'Present'}]);
 assert.match(csv,/"'=IMPORTXML\(""evil""\)"/);
});
test('Manila time helpers handle boundaries',()=>{
 const s=data.schedules[0];
 assert.equal(weekdayLabel(2),'Tuesday');assert.equal(timeLabel('19:00:00'),'7:00 PM');
 assert.equal(classInProgress(s,{weekday:2,minutes:540}),true);assert.equal(classInProgress(s,{weekday:2,minutes:720}),false);
 assert.equal(windowIsOpen(data.windows[0],new Date('2026-11-24T03:00:00Z')),false);
 assert.deepEqual(manilaClock(new Date('2026-11-17T02:00:00Z')),{date:'2026-11-17',weekday:2,minutes:600});
});
test('normal navigation is handled by React without displaying the old full-screen verification',()=>{
 assert.match(text('../src/App.jsx'),/HashRouter|Routes/);
 assert.match(provider,/Navigating among React routes NEVER remounts this provider/);
 assert.doesNotMatch(pages,/Verifying your secure session/i);
 assert.doesNotMatch(student,/Verifying your secure session/i);
});
test('sensitive admin operations remain RPC calls',()=>{
 for(const n of ['set_student_approval','admin_update_student_assignment','open_class_attendance','close_class_attendance'])assert.ok(pages.includes(n));
 assert.match(student,/mark_my_attendance/);assert.match(student,/save_student_profile/);
 assert.match(v3,/REVOKE ALL ON FUNCTION public\.admin_update_student_assignment/);
});
test('student identity validation and section-based subject filtering remain in React form',()=>{
 assert.match(student,/current_github_username/);assert.match(student,/sectionSubjects/);
 assert.equal(normalizeGitHubAccount('https://github.com/Example-1/'),'example-1');
});
test('hash-based routing is used to support GitHub Pages',()=>{
 assert.match(text('../src/main.jsx'),/HashRouter/);
 assert.match(text('../vite.config.js'),/process\.env\.BASE_PATH/);
 assert.match(text('../.github/workflows/deploy.yml'),/upload-pages-artifact/);
});
test('CSS includes reduced-motion support and responsive designs',()=>{
 const css=text('../src/styles/app.css');
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(max-width:660px\)/);
});

test('background refresh does not silently extend idle sessions',()=>{
 assert.match(text('../src/lib/api.js'),/touchSession = true/);
 assert.match(text('../src/state/SessionProvider.jsx'),/getContext\(\{touchSession:false\}\)/);
 assert.match(text('../src/lib/api.js'),/portal_session_active/);
});
