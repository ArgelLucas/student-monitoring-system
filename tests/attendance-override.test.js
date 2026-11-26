import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { studentClassStatus } from '../src/lib/student-flow.js';
import { studentScheduleSummary } from '../src/lib/student-flow.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const migration = read('supabase/migrations/202611260006_attendance_override.sql');
const admin = read('src/pages/AdminPages.jsx');
const api = read('src/lib/api.js');

const schedule = {id:9, section_id:2, subject_id:11, weekday:1, start_time:'13:00:00', end_time:'16:00:00'};
const otherDay = {weekday:4,date:'2026-11-26',minutes:15*60};
const now = new Date('2026-11-26T07:00:00Z');
const live = {id:31,schedule_id:9,meeting_date:'2026-11-26',is_open:true,is_override:true,
  opened_at:'2026-11-26T06:55:00Z',expires_at:'2026-11-26T07:25:00Z'};

test('force-open RPC only permits administrators, requires an audit reason, and bounds the duration',()=>{
  assert.match(migration,/FUNCTION public\.force_open_class_attendance/);
  assert.match(migration,/public\.portal_session_active\(\)/);
  assert.match(migration,/public\.is_admin\(\)/);
  assert.match(migration,/p_minutes NOT IN \(15,30,60\)/);
  assert.match(migration,/length\(v_reason\) < 10/);
  assert.match(migration,/attendance\.window\.force_opened/);
  assert.match(migration,/override_reason/);
  assert.match(migration,/REVOKE ALL ON FUNCTION public\.force_open_class_attendance/);
});

test('student RPC checks real section, approved account, and the active server window',()=>{
  assert.match(migration,/FUNCTION public\.mark_my_attendance/);
  assert.match(migration,/public\.is_approved_student\(\)/);
  assert.match(migration,/s\.section_id=v_profile\.section_id/);
  assert.match(migration,/w\.opened_at<=v_now AND w\.expires_at>v_now/);
  assert.match(migration,/IF NOT v_window\.is_override AND/);
  assert.match(migration,/ON CONFLICT DO NOTHING/);
});

test('ordinary opens still use the published schedule and the admin can close a forced window',()=>{
  assert.match(migration,/FUNCTION public\.open_class_attendance/);
  assert.match(migration,/v_manila::time < v_schedule\.start_time/);
  assert.match(admin,/force_open_class_attendance/);
  assert.match(admin,/close_class_attendance/);
  assert.match(admin,/Extra session open/);
  assert.match(api,/is_override/);
});

test('student sees an active extra class even on another weekday, but not after expiry',()=>{
  const data={schedules:[schedule],attendance:[],windows:[live]};
  const state=studentClassStatus(schedule,data,otherDay,now);
  assert.equal(state.key,'open');
  assert.equal(state.canCheckIn,true);
  assert.equal(studentScheduleSummary(data,otherDay,now).open,1);
  const expired=studentClassStatus(schedule,data,otherDay,new Date('2026-11-26T08:00:00Z'));
  assert.equal(expired.canCheckIn,false);
});
