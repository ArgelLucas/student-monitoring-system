import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  CLASS_RECORD_WEIGHTS,CLASS_RECORD_CATEGORIES,calculateTermGrade,
  calculateFinalGrade,classRecordEquivalent,classRecordsCsv,validateScore,
} from '../src/lib/class-records.js';
const file = path=>readFileSync(new URL('../'+path, import.meta.url),'utf8');
const example=CLASS_RECORD_CATEGORIES.map((category,id)=>({id:id+1,category,max_score:20,title:category+' 1'}));
const raw={ '1:0000000000':'20', '2:0000000000':'10','3:0000000000':'20',
  '4:0000000000':'20','5:0000000000':'10' };

test('source workbook weight categories sum to exactly 100 percent',()=>{
  assert.deepEqual(CLASS_RECORD_WEIGHTS,{Activities:.2,Quizzes:.1,Attendance:.1,Projects:.3,Examinations:.3});
  assert.equal(Object.values(CLASS_RECORD_WEIGHTS).reduce((a,b)=>a+b,0),1);
});
test('gradebook uses normalized assessment values and source category weights',()=>{
  const result=calculateTermGrade(example,raw,'0000000000');
  assert.equal(result.complete,true);
  assert.equal(result.grade,80);
  assert.equal(result.groups.Activities.weighted,20);
  assert.equal(result.groups.Quizzes.weighted,5);
  assert.equal(result.groups.Projects.weighted,30);
  assert.equal(result.groups.Examinations.weighted,15);
  assert.equal(result.equivalent,2.5);
  assert.equal(result.remark,'Passed');
});
test('blank scores and missing category assessments do not produce false failed grades',()=>{
  const none=calculateTermGrade(example,{},'0000000000');
  assert.equal(none.grade,null);assert.equal(none.remark,'In progress');
  assert.equal(calculateTermGrade(example.slice(0,3),raw,'0000000000').grade,null);
  const zeros=Object.fromEntries(example.map(a=>[`${a.id}:0000000000`,'0']));
  const complete=calculateTermGrade(example,zeros,'0000000000');
  assert.equal(complete.grade,0);assert.equal(complete.remark,'Failed');
});
test('workbook passing and equivalent boundaries are preserved',()=>{
  assert.equal(classRecordEquivalent(96.5),1);
  assert.equal(classRecordEquivalent(81.5),2.25);
  assert.equal(classRecordEquivalent(74.5),3);
  assert.equal(classRecordEquivalent(74.49),5);
  assert.equal(classRecordEquivalent(NaN),null);
});
test('semester grade uses midterm and final average and remains pending if either term is incomplete',()=>{
  assert.deepEqual(calculateFinalGrade({complete:true,grade:80},{complete:true,grade:90}),
    {grade:85,equivalent:2,remark:'Passed'});
  assert.equal(calculateFinalGrade({complete:false},{complete:true,grade:90}).grade,null);
});
test('score validation rejects negative, above max and excessive decimals',()=>{
  assert.equal(validateScore('','20'),null);
  assert.equal(validateScore('0','20'),null);
  assert.equal(validateScore('20','20'),null);
  assert.match(validateScore('20.01','20'),/0 to 20/);
  assert.match(validateScore('-1','20'),/0 to 20/);
  assert.match(validateScore('1.999','20'),/decimal/);
});
test('CSV protects spreadsheet exports against formula injection and includes official student identifier',()=>{
  const csv=classRecordsCsv([{student_number:'0000000000',full_name:'=HYPERLINK("unsafe")'}],example,raw,'Midterm','1A','CT 123a');
  assert.match(csv,/0000000000/);assert.match(csv,/"'=HYPERLINK\(""unsafe""\)"/);assert.match(csv,/"80"/);
});
test('class records is a restricted admin route and original student-number autofill is retained',()=>{
  assert.match(file('src/App.jsx'),/path="class-records" element={<ClassRecordsPage\/>}/);
  assert.match(file('src/pages/AdminPages.jsx'),/Class records/);
  assert.match(file('src/pages/StudentPages.jsx'),/lookup_roster_student/);
  assert.match(file('src/pages/StudentPages.jsx'),/submit_roster_student_profile/);
  assert.match(file('src/pages/StudentPages.jsx'),/student-school-number/);
  assert.match(file('src/pages/ClassRecordsPage.jsx'),/warnOnLink/);
  assert.doesNotMatch(file('src/pages/ClassRecordsPage.jsx'),/import.*useBlocker/);
});
test('grade tables require administrator and validate section plus maximum score on server',()=>{
  const sql=file('supabase/migrations/202611260005_class_records.sql');
  assert.match(sql,/academic_year text NOT NULL/);
  assert.match(sql,/semester text NOT NULL/);
  assert.match(file('src/pages/ClassRecordsPage.jsx'),/School year/);
  assert.match(file('src/pages/ClassRecordsPage.jsx'),/Semester/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/WITH CHECK \(\(SELECT public.is_admin\(\)\)\)/);
  assert.match(sql,/IF NEW.score > v_max THEN RAISE EXCEPTION/);
  assert.match(sql,/r.section_id=v_section/);
  assert.match(sql,/REFERENCES public.student_roster\(student_number\)/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public.save_class_record_scores/);
  assert.match(sql,/class_record_changes/);
  assert.match(file('src/lib/api.js'),/save_class_record_scores/);
});
