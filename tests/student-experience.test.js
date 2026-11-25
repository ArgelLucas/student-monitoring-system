import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectPriorityClass, groupStudentSchedule } from '../src/lib/student-dashboard.js';

const s = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const schedule = (id, weekday, start_time) => ({id, weekday, start_time, end_time:'19:00:00'});

test('dashboard prioritizes a currently open class over one waiting or upcoming', () => {
  const today=[
    {schedule:schedule(1,2,'13:00:00'),key:'upcoming'},
    {schedule:schedule(2,2,'09:00:00'),key:'open'},
    {schedule:schedule(3,2,'08:00:00'),key:'recorded'},
  ];
  assert.equal(selectPriorityClass(today).schedule.id, 2);
  assert.equal(selectPriorityClass([]), null);
  assert.equal(today[0].schedule.id, 1, 'selection does not reorder the original data');
});

test('weekly timetable groups by day and sorts class times without inventing meetings', () => {
  const rows=[schedule(5,5,'15:00:00'),schedule(3,2,'13:00:00'),schedule(1,2,'09:00:00')];
  const grouped=groupStudentSchedule(rows);
  assert.deepEqual(grouped.map(g=>g.weekday),[2,5]);
  assert.deepEqual(grouped[0].meetings.map(s=>s.id),[1,3]);
  assert.equal(grouped.reduce((n,g)=>n+g.meetings.length,0),3);
});

test('student navigation stays inside React router and preserves logout', () => {
  const jsx=s('../src/pages/StudentPages.jsx');
  assert.match(jsx,/NavLink key=\{to\}/);
  assert.match(jsx,/className="student-v59-mobile-nav"/);
  assert.match(jsx,/onClick=\{logout\}/);
  assert.match(jsx,/className="student-skip-link"/);
  assert.match(jsx,/data-student-enter/);
});

test('attendance action still uses server RPC, checks window, and requires confirmation', () => {
  const jsx=s('../src/pages/StudentPages.jsx');
  assert.match(jsx,/rpc\('mark_my_attendance'/);
  assert.match(jsx,/if \(!state.canCheckIn\)/);
  assert.match(jsx,/Confirm check-in/);
  assert.match(jsx,/refreshData\(\)/);
});

test('new styles are scoped and adapt to tablet, mobile and reduced motion', () => {
  const css=s('../src/styles/student-experience.css');
  const entry=s('../src/main.jsx');
  assert.match(entry,/import '\.\/styles\/student-experience\.css'/);
  for(const marker of ['.student-experience-v59','.student-v59-mobile-nav','@media(max-width:820px)','@media(max-width:700px)','@media(max-width:370px)','prefers-reduced-motion']) {
    assert.ok(css.includes(marker), `Missing ${marker}`);
  }
  assert.match(s('../src/components/StudentExperience.jsx'),/useGSAP/);
});
