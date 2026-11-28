import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildOfficialClassDirectory,searchOfficialStudents,VERIFIED_SECTION_CODES,yearForSection}
  from '../src/lib/official-class-directory.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const timetable=read('supabase/migrations/202611190002_schedule_attendance.sql');
const admin=read('src/pages/AdminPages.jsx');
const app=read('src/App.jsx');
const fixtures={
  sections:[{id:1,code:'1A'},{id:2,code:'1B'},{id:3,code:'2A'},{id:4,code:'2B'},{id:5,code:'3A'},{id:6,code:'3B'}],
  subjects:[{id:1,code:'CT 123a'},{id:2,code:'CT 223a'},{id:3,code:'QCA 113'},{id:4,code:'CT 304'}],
  schedules:[{id:1,section_id:3,subject_id:2,weekday:3,start_time:'13:00:00',end_time:'15:00:00'},
    {id:2,section_id:3,subject_id:3,weekday:4,start_time:'09:00:00',end_time:'12:00:00'}],
  roster:[{student_number:'2025000001',section_id:3,surname:'Example',first_name:'Alex',middle_initial:'A',
    full_name:'Example, Alex A.',source_term:'1st Semester',active:true,linked_user_id:'user-1'},
    {student_number:'2025000002',section_id:3,surname:'Example',first_name:'Bea',middle_initial:'B',
    full_name:'Example, Bea B.',source_term:'1st Semester',active:true,name_needs_review:true},
    {student_number:'2025000003',section_id:1,surname:'First',first_name:'Student',middle_initial:'C',
    full_name:'First, Student C.',source_term:'2nd Semester',active:true},
    {student_number:'2025000004',section_id:3,surname:'Inactive',first_name:'Student',active:false}],
  profiles:[{user_id:'user-1',student_number:'2025000001',is_approved:true}]
};

test('confirmed years and six section codes come from supplied roster structure',()=>{
  assert.deepEqual(VERIFIED_SECTION_CODES,['1A','1B','2A','2B','3A','3B']);
  assert.deepEqual(VERIFIED_SECTION_CODES.map(yearForSection),[1,1,2,2,3,3]);
  assert.equal(yearForSection('4A'),null);
  assert.equal(yearForSection('2C'),null);
});

test('2A shares one official roster across both subject timetables, without enrollment entities',()=>{
  const directory=buildOfficialClassDirectory(fixtures);
  assert.equal(directory.length,6);
  const s=directory.find(x=>x.code==='2A');
  assert.equal(s.studentCount,2);
  assert.deepEqual(s.subjects.map(x=>x.code),['CT 223a','QCA 113']);
  assert.equal(s.subjects[0].meetings.length,1);
  assert.equal(s.pendingReview,1);
  assert.equal(s.members[0].accountStatus,'Approved');
  assert.equal(s.members[1].accountStatus,'Not registered');
  assert.deepEqual(s.sourceTerms,['1st Semester']);
  assert.deepEqual(directory.find(x=>x.code==='1A').sourceTerms,['2nd Semester']);
});

test('source roster filters inactive entries and search does not create students',()=>{
  const s=buildOfficialClassDirectory(fixtures).find(x=>x.code==='2A');
  assert.equal(searchOfficialStudents(s.members,'Bea').length,1);
  assert.equal(searchOfficialStudents(s.members,'2025000001').length,1);
  assert.equal(searchOfficialStudents(s.members,'not-a-student').length,0);
  assert.equal(searchOfficialStudents(s.members,'').length,2);
});

test('original timetable still provides six sections and 14 meeting slots',()=>{
  const entries=[...timetable.matchAll(/\('([123][AB])','(CT 123a|CT 223a|QCA 113|CT 304)',[1-7],'\d\d:\d\d','\d\d:\d\d'\)/g)];
  assert.equal(entries.length,14);
  assert.equal(new Set(entries.map(e=>e[1])).size,6);
});

test('admin Classes tab now uses original roster, not manual academic enrollment controls',()=>{
  const component=read('src/components/OfficialClassDirectory.jsx');
  assert.match(admin,/<OfficialClassDirectory data=\{data\}\/>/);
  assert.match(admin,/force_open_class_attendance/);
  assert.match(admin,/close_class_attendance/);
  assert.doesNotMatch(admin,/\["\/admin\/academic-classes", "Class enrollments"/);
  assert.match(app,/path="academic-classes" element=\{<Navigate replace to="\/admin\/classes"\/>\}/);
  assert.match(component,/Search roster/);
  assert.match(component,/Official student roster/);
  assert.doesNotMatch(component,/enrollClassStudents|createAcademicTerm|createClassOffering|archiveClassOffering/);
});
