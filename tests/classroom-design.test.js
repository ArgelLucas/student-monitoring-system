import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');

test('approved Classroom design loads after Verdant, with brand icon for the admin shell',()=>{
  assert.match(read('src/main.jsx'),/import '\.\/styles\/classroom\.css'/);
  assert.match(read('src/pages/AdminPages.jsx'),/app-layout verdant-app classroom-app/);
  assert.match(read('src/pages/AdminPages.jsx'),/studentmonitor-icon\.png/);
  assert.ok(existsSync(new URL('../public/studentmonitor-icon.png',import.meta.url)));
});
test('compact sidebar and bento layout remain at full desktop width',()=>{
  const css=read('src/styles/classroom.css');
  for(const selector of ['.classroom-app .sidebar','.classroom-app .workspace','.classroom-app .topbar','.classroom-overview .stats-grid','.classroom-overview .dashboard-bento','.class-window-list','.approval-preview-list','.activity-preview-list']){
    assert.ok(css.includes(selector),`missing style: ${selector}`);
  }
  assert.match(css,/--classroom-side:\s*234px/);
  assert.match(css,/@media \(max-width: 900px\)/);
  assert.match(css,/@media \(max-width: 640px\)/);
});
test('approval preview uses secure RPC and class window list uses actual Supabase schedules',()=>{
  const source=read('src/pages/AdminPages.jsx');
  assert.match(source,/set_student_approval/);
  assert.match(source,/await perform\(\(\)\s*=>\s*rpc\(["']set_student_approval["']/s);
  assert.match(source,/pending\.slice/);
  assert.match(source,/todays\.map\(\s*\(?\s*s\s*\)?\s*=>/);
  assert.match(source,/data\.audit\.slice/);
  assert.doesNotMatch(source,/value:\s*248|value:\s*217/);
});
