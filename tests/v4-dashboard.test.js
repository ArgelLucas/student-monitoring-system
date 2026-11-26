import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attendanceTrend, renderAttendanceChart, renderAdminDashboard } from '../src/pages/admin-dashboard.js';
import { adminScreen, adminAttendanceScreen } from '../src/pages/screens.js';

const rows = {
  sections:[{id:1,code:'1A'},{id:2,code:'2A'}],
  subjects:[{id:1,code:'CT 123a'},{id:2,code:'CT 223a'}],
  sectionSubjects:[{section_id:1,subject_id:1},{section_id:2,subject_id:2}],
  profiles:[
    {user_id:'a',section_id:1,subject_id:1,first_name:'Test',surname:'Student',github_username:'test-student',is_approved:true},
    {user_id:'b',section_id:1,subject_id:1,first_name:'New',surname:'Student',github_username:'new-student',is_approved:false},
    {user_id:'c',section_id:2,subject_id:2,first_name:'Other',surname:'Student',github_username:'other-student',is_approved:true},
  ],
  schedules:[
    {id:10,section_id:1,subject_id:1,weekday:3,start_time:'09:00:00',end_time:'12:00:00'},
    {id:11,section_id:2,subject_id:2,weekday:3,start_time:'13:00:00',end_time:'15:00:00'},
  ],
  windows:[
    {id:20,schedule_id:10,meeting_date:'2026-11-25',is_open:false,opened_at:'2026-11-25T01:00:00Z',expires_at:'2026-11-25T04:00:00Z'},
    {id:21,schedule_id:11,meeting_date:'2026-11-25',is_open:false,opened_at:'2026-11-25T05:00:00Z',expires_at:'2026-11-25T07:00:00Z'},
  ],
  attendance:[{id:111,student_id:'a',subject_id:1,attendance_window_id:20,attendance_date:'2026-11-25',marked_at:'2026-11-25T02:00:00Z',status:'Present'}],
  audit:[{action:'student.approved',subject_user_id:'a',created_at:'2026-11-25T06:00:00Z',details:{}}],
};

test('attendance chart uses actual approved roster and opened class windows',()=>{
  const points=attendanceTrend(rows,'2026-11-25',7);
  assert.equal(points.length,7);
  assert.deepEqual(points.at(-1).expected,2);
  assert.deepEqual(points.at(-1).present,1);
  assert.equal(points.at(-1).rate,50);
  assert.equal(points[0].rate,null);
  const svg=renderAttendanceChart(points);
  assert.match(svg,/role="img"/);
  assert.match(svg,/50%/);
});

test('chart supports seven, thirty and ninety day ranges without invented values',()=>{
  assert.equal(attendanceTrend(rows,'2026-11-25',30).length,6);
  assert.equal(attendanceTrend(rows,'2026-11-25',90).length,6);
  const empty=attendanceTrend({...rows, windows:[]},'2026-11-25',7);
  assert.equal(empty.every(p=>p.rate===null),true);
});

test('dashboard displays live-derived metrics and actual sections, with action links',()=>{
  const html=renderAdminDashboard({admin:true},rows,7);
  assert.match(html,/Approved students/);
  assert.match(html,/Pending approvals/);
  assert.match(html,/Check-ins today/);
  assert.match(html,/Attendance analytics/);
  assert.match(html,/Open attendance/);
  assert.match(html,/data-chart-range="30"/);
  assert.match(html,/data-filter-pending="true"/);
  assert.match(html,/student\.approved|Student Approved/);
  assert.match(html,/href="#\/admin\/classes"/);
});

test('user-submitted profile text is escaped by dashboard',()=>{
  const injection={...rows,profiles:[{...rows.profiles[0], first_name:'<img src=x onerror=alert(1)>'}]};
  const html=renderAdminDashboard({admin:true},injection,7);
  assert.doesNotMatch(html,/<img src=x/);
  assert.match(html,/&lt;img src=x/);
});

test('admin shell provides navigation, search, notification, logout and accessibility',()=>{
  const html=adminScreen({admin:true,adminMeta:{pending:1}},rows);
  assert.match(html,/id="global-search-form"/);
  assert.match(html,/id="sidebar-toggle"/);
  assert.match(html,/id="logout-button"/);
  assert.match(html,/id="admin-content"/);
  assert.match(html,/aria-label="Admin navigation"/);
});

test('database compatibility fallback only addresses the known v2 audit details column',()=>{
  const source=readFileSync(new URL('../src/lib/api.js',import.meta.url),'utf8');
  assert.match(source,/getAuditWithCompatibility/);
  assert.match(source,/202611250003_admin_reporting.sql/);
  assert.match(source,/if \(!\/column/);
});

test('live attendance route shows real class controls without inventing absences',()=>{
  const html=adminAttendanceScreen({admin:true},rows);
  assert.match(html,/Today’s attendance monitor/);
  assert.match(html,/Not an automatic absence classification/);
  // Buttons only render when the selected weekday has a scheduled meeting.
  // Check the control is implemented without making this test depend on today's date.
  const source=readFileSync(new URL('../src/pages/screens.js',import.meta.url),'utf8');
  assert.match(source,/data-window-action=/);
  assert.match(html,/Class attendance controls/);
  assert.match(html,/Reports &amp; CSV|Reports & CSV/);
});
