import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/StudentPages.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/student-polish.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('student profile retains protected Supabase submission and identity verification', () => {
  assert.match(source, /rpc\('save_student_profile', result\.payload\)/);
  assert.match(source, /rpc\('current_github_username'\)/);
  assert.match(source, /validateStudentProfile\(form, catalog, verified/);
  assert.match(source, /disabled=\{approved\}/);
});
test('profile replaces approved-user onboarding panel with account summary', () => {
  assert.match(source, /student-record-summary/);
  assert.match(source, /student-record-section-legend/);
  assert.match(source, /approved \? 'MANAGING YOUR RECORD' : 'NEXT STEPS'/);
});
test('logout remains connected to the original secure action, with static hover and visible focus', () => {
  assert.match(source, /className="student-logout student-static-action" onClick=\{logout\}/);
  assert.match(css, /student-logout\.student-static-action:hover:not\(:disabled\)/);
  assert.match(css, /student-logout\.student-static-action:active:not\(:disabled\)/);
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
test('student style isolation preserves the admin and login pages', () => {
  assert.match(app, /import '\.\/styles\/student-polish\.css'/);
  assert.match(css, /\.student-experience-v59/);
  assert.doesNotMatch(css, /\.admin-app/);
});
