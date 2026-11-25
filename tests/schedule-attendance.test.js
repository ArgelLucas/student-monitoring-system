import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  manilaClock, timeLabel, weekdayLabel, classInProgress,
  todayWindow, windowIsOpen, scheduleSort
} from '../src/lib/schedule.js';
import { attendanceScreen, studentScreen, adminScreen } from '../src/pages/screens.js';

const migration = readFileSync(new URL('../supabase/migrations/202611190002_schedule_attendance.sql', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/api.js', import.meta.url), 'utf8');

const profile = {
  section_id: 2, subject_id: 10, surname: 'Example', first_name: 'Ada',
  middle_initial: 'L', is_approved: true, github_username: 'ada-example'
};
const context = { profile, admin: false };
const schedule = { id: 1, section_id: 2, subject_id: 10, weekday: 2, start_time: '09:00:00', end_time: '12:00:00' };
const catalog = {
  sections: [{ id: 2, code: '1A' }],
  subjects: [{ id: 10, code: 'CT 123a', name: 'CT 123a' }],
};
const data = { ...catalog, schedules: [schedule], windows: [], attendance: [] };

test('schedule formatting uses correct class clock labels', () => {
  assert.equal(weekdayLabel(2), 'Tuesday');
  assert.equal(timeLabel('09:00:00'), '9:00 AM');
  assert.equal(timeLabel('19:00:00'), '7:00 PM');
  assert.ok(scheduleSort({ ...schedule, weekday: 1 }, schedule) < 0);
});

test('Philippine time determines class occurrence', () => {
  assert.deepEqual(manilaClock(new Date('2026-11-17T02:00:00Z')),
    { date: '2026-11-17', weekday: 2, minutes: 600 });
  assert.equal(classInProgress(schedule, { weekday: 2, minutes: 540 }), true);
  assert.equal(classInProgress(schedule, { weekday: 2, minutes: 719 }), true);
  assert.equal(classInProgress(schedule, { weekday: 2, minutes: 720 }), false);
  assert.equal(classInProgress(schedule, { weekday: 3, minutes: 600 }), false);
});

test('student display waits for admin window and records only matching check-ins', () => {
  const clock = manilaClock();
  const win = {
    id: 25, schedule_id: schedule.id, meeting_date: clock.date,
    is_open: true, opened_at: new Date(Date.now() - 1000).toISOString(),
    expires_at: new Date(Date.now() + 1000 * 60).toISOString()
  };
  assert.equal(todayWindow(schedule, [win], clock)?.id, 25);
  assert.equal(windowIsOpen(win), true);
  assert.equal(windowIsOpen({ ...win, is_open: false }), false);
  assert.match(studentScreen(context, data), /Your weekly timetable/);
  assert.match(attendanceScreen(context, data), /The server validates/);
  assert.match(adminScreen({ admin: true }, { ...data, profiles: [] }), /Class timetable and attendance controls/);
});

test('all 14 instructor meetings are seeded once in new migration', () => {
  const meetings = [...migration.matchAll(/\('([123][AB])','(CT 123a|CT 223a|QCA 113|CT 304)',[1-7],'\d\d:\d\d','\d\d:\d\d'\)/g)];
  assert.equal(meetings.length, 14);
  assert.equal(new Set(meetings.map(m => m[1])).size, 6);
  assert.equal(new Set(meetings.map(m => m[2])).size, 4);
});

test('SQL removes unrestricted endpoint and gates every attendance write', () => {
  assert.match(migration, /drop function if exists public\.mark_my_attendance\(\)/);
  assert.match(migration, /create or replace function public\.mark_my_attendance\(p_schedule_id bigint\)/);
  assert.match(migration, /public\.is_approved_student\(\)/);
  assert.match(migration, /v_window\.id/);
  assert.match(migration, /v_manila::time >= v_schedule\.end_time/);
  assert.match(migration, /and w\.is_open/);
  assert.match(migration, /attendance_one_per_window_idx/);
  assert.match(migration, /create or replace function public\.open_class_attendance/);
  assert.match(migration, /create or replace function public\.close_class_attendance/);
  assert.match(migration, /create policy class_schedules_read/);
  assert.match(migration, /create policy attendance_windows_read/);
  assert.match(api, /rpc\('list_section_subjects'\)/);
  assert.match(main, /'mark_my_attendance',\s*\{\s*p_schedule_id:/);
});
