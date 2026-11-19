import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeGitHubAccount, escapeHtml, manilaDate } from '../src/lib/format.js';

const migration = readFileSync(new URL('../supabase/migrations/202611190001_initial.sql', import.meta.url), 'utf8');

test('HTML content is escaped before insertion into string templates', () => {
  assert.equal(escapeHtml(`<script>"'&`), '&lt;script&gt;&quot;&#39;&amp;');
});

test('GitHub handle normalization supports profile URLs', () => {
  assert.equal(normalizeGitHubAccount('https://github.com/Example-1/'), 'example-1');
  assert.equal(normalizeGitHubAccount('@Example-1'), 'example-1');
});

test('Manila date string has YYYY-MM-DD format', () => {
  assert.match(manilaDate(), /^\d{4}-\d{2}-\d{2}$/);
});

test('SQL guards exist for each sensitive operation (static contract)', () => {
  for (const name of ['portal_session_active', 'current_github_username',
      'is_admin', 'is_approved_student', 'save_student_profile',
      'mark_my_attendance', 'set_student_approval', 'end_portal_session']) {
    assert.match(migration, new RegExp(`create function public\\.${name}\\(`));
  }
  assert.match(migration, /join auth\.sessions/);
  assert.match(migration, /alter table public\.student_profiles enable row level security/);
  assert.match(migration, /unique \(student_id, subject_id, attendance_date\)/);
  assert.match(migration, /grant select on public\.sections, public\.subjects, public\.student_profiles/);
});
