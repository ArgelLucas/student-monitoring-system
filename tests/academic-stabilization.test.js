import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('only one authoritative attendance override migration exists', () => {
  const names = readdirSync(new URL('../supabase/migrations/', import.meta.url));
  assert.deepEqual(
    names.filter(name => /^202611260006.*\.sql$/.test(name)),
    ['202611260006_attendance_override.sql'],
  );
});

test('override migration uses complete SQL dollar quoting and enforces daily boundary', () => {
  const sql = read('supabase/migrations/202611260006_attendance_override.sql');
  assert.doesNotMatch(sql, /(?:^|\n)AS \$\s*\n|(?:^|\n)\$;\s*(?:\n|$)/);
  assert.equal((sql.match(/\$\$/g) || []).length % 2, 0);
  assert.match(sql, /v_end := LEAST\(/);
  assert.match(sql, /v_today \+ 1/);
  assert.match(sql, /IF v_end <= v_now/);
  assert.match(sql, /public\.portal_session_active\(\)/);
  assert.match(sql, /public\.is_admin\(\)/);
  assert.match(sql, /public\.is_approved_student\(\)/);
  assert.match(sql, /IF NOT v_window\.is_override AND/);
  assert.match(sql, /attendance\.window\.force_opened/);
});

test('official student roster reads are paged and fail rather than truncate', () => {
  const source = read('src/lib/api.js');
  const roster = source.slice(
    source.indexOf('async function getOfficialRoster()'),
    source.indexOf('async function getAuditWithCompatibility()'),
  );
  assert.match(roster, /pageSize = 500/);
  assert.match(roster, /\.range\(offset, offset \+ pageSize - 1\)/);
  assert.match(roster, /collected\.push\(\.\.\.result\.data\)/);
  assert.match(roster, /exceeds the safe 10,000-row limit/);
  assert.match(roster, /student_roster/);
});

test('gradebook remains private and does not create historical grades during migration', () => {
  const sql = read('supabase/migrations/202611260005_class_records.sql');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /WITH CHECK \(\(SELECT public\.is_admin\(\)\)\)/);
  assert.doesNotMatch(sql, /INSERT INTO public\.class_record_scores\s*\(/i);
});
