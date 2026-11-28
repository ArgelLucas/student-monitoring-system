import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {offeringTitle,enrollmentName} from '../src/lib/academic-classes.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('supabase/migrations/202611280007_academic_classes_enrollments.sql');
const ui=read('src/pages/AcademicClassesPage.jsx');
const api=read('src/lib/academic-classes.js');
const routes=read('src/App.jsx');
const admin=read('src/pages/AdminPages.jsx');

test('schema models years, terms, offerings, meeting snapshots and historical student enrollments',()=>{
  for(const table of ['academic_years','academic_terms','class_offerings','class_offering_meetings','class_enrollments'])
    assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS public\\.'+table));
  assert.match(sql,/UNIQUE \(academic_term_id,section_id,subject_id\)/);
  assert.match(sql,/UNIQUE \(offering_id,student_number\)/);
  assert.match(sql,/surname_at_enrollment text NOT NULL/);
  assert.match(sql,/section_id_at_enrollment bigint NOT NULL/);
  assert.match(sql,/source_schedule_id bigint REFERENCES public\.class_schedules/);
});
test('student enrollment cannot duplicate a canonical profile or be silently deleted',()=>{
  assert.match(sql,/student_number text NOT NULL REFERENCES public\.student_roster\(student_number\)/);
  assert.match(sql,/ON CONFLICT \(offering_id,student_number\) DO NOTHING/);
  assert.match(sql,/IF v_roster\.section_id<>v_offering\.section_id THEN/);
  assert.match(sql,/enrolled_on date NOT NULL/);
  assert.doesNotMatch(sql,/DELETE FROM public\.student_roster|TRUNCATE public\.class_enrollments/i);
  assert.match(sql,/UPDATE public\.class_enrollments SET status=p_status/);
});
test('every academic table has admin-only row security and no direct authenticated writes',()=>{
  for(const table of ['academic_years','academic_terms','class_offerings','class_offering_meetings','class_enrollments'])
    assert.match(sql,new RegExp('ALTER TABLE public\\.'+table+' ENABLE ROW LEVEL SECURITY'));
  assert.match(sql,/REVOKE ALL ON public\.academic_years,public\.academic_terms/);
  assert.match(sql,/GRANT SELECT ON public\.academic_years,public\.academic_terms/);
  assert.match(sql,/FOR SELECT TO authenticated USING \(\(SELECT public\.is_admin\(\)\)\)/);
  for(const name of ['admin_create_academic_year','admin_create_academic_term','admin_create_class_offering',
    'admin_enroll_class_students','admin_update_enrollment_status','admin_archive_class_offering'])
    assert.match(sql,new RegExp('public\\.'+name));
  assert.match(sql,/NOT public\.portal_session_active\(\) OR NOT public\.is_admin\(\)/);
  assert.match(sql,/academic\.students\.enrolled/);
});
test('academic UI is restricted to admin route and collects real inputs',()=>{
  assert.match(routes,/<AdminGate\/>/);
  assert.match(routes,/path="academic-classes" element=\{<AcademicClassesPage\/>\}/);
  assert.match(admin,/\/admin\/academic-classes/);
  assert.match(ui,/useSession\(\)/);
  assert.match(ui,/createClassOffering\(/);
  assert.match(ui,/enrollClassStudents\(/);
  assert.match(ui,/updateEnrollmentStatus\(/);
  assert.match(ui,/archiveClassOffering\(/);
  assert.match(ui,/window\.confirm/);
});
test('paginated reads do not silently discard academic records',()=>{
  assert.match(api,/\.range\(offset,offset\+499\)/);
  assert.match(api,/Academic records exceed the 10,000-row client safety limit/);
  assert.match(api,/supabase\.rpc\(name,args\)/);
});
test('helper functions retain per-class source labels',()=>{
  assert.equal(offeringTitle({section_id:1,subject_id:2},[{id:1,code:'2A'}],[{id:2,code:'CT 223a'}]),'2A · CT 223a');
  assert.equal(enrollmentName({surname_at_enrollment:'Example',first_name_at_enrollment:'Student',
    middle_initial_at_enrollment:'A'}),'Example, Student A');
});
