import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const landing = readFileSync('src/components/AccessLanding.jsx', 'utf8');
const studentPages = readFileSync('src/pages/StudentPages.jsx', 'utf8');
const styles = readFileSync('src/styles/access-landing.css', 'utf8');
const entry = readFileSync('src/main.jsx', 'utf8');

test('new landing stays connected to the original GitHub OAuth function', () => {
  assert.match(landing, /loginWithGitHub\(\)/);
  assert.match(landing, /disabled=\{busy\}/);
  assert.match(landing, /PageAlert message=\{error\}/);
  assert.match(studentPages, /return <AccessLanding\/>/);
});

test('landing entrance animation is scoped and respects reduced motion', () => {
  assert.match(landing, /useGSAP\(/);
  assert.match(landing, /prefers-reduced-motion: reduce/);
  assert.match(landing, /scope: rootRef/);
  assert.doesNotMatch(landing, /scrollIntoView|repeat:\s*-1/);
});

test('new CSS is scoped, mobile responsive and loaded after existing styles', () => {
  assert.match(styles, /\.access-page/);
  assert.match(styles, /max-width: 800px/);
  assert.match(styles, /max-width: 480px/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(entry, /import '\.?\/styles\/access-landing\.css';/);
});

test('login is focused and does not create decorative fake actions', () => {
  assert.match(landing, /Continue with GitHub/);
  assert.doesNotMatch(landing, /<Journey|login-features|Stay connected/);
  assert.doesNotMatch(landing, /VITE_SUPABASE_SECRET|service_role/);
});
