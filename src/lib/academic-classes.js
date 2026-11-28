// Administrative academic workspace. RLS and secure PostgreSQL RPCs are authoritative.
// This module never exposes official rosters to non-administrator portals.
import {supabase} from './supabase.js';

const requireData = (result) => {
  if (result.error) throw new Error(result.error.message || 'Academic request failed');
  return result.data;
};

// Paginate ordered reads to avoid silently omitting students/enrollments.
async function paged(table,fields,key='id',filters=[]) {
  const out=[];
  for(let offset=0;offset<=10000;offset+=500) {
    let query=supabase.from(table).select(fields).order(key,{ascending:true}).range(offset,offset+499);
    for(const [column,value] of filters) query=query.eq(column,value);
    const result=await query;
    const page=requireData(result);
    out.push(...page);
    if(page.length<500) return out;
  }
  throw new Error('Academic records exceed the 10,000-row client safety limit.');
}
export function isAcademicSchemaMissing(error) {
  return Boolean(error && (['42P01','PGRST205'].includes(error.code) ||
    /could not find the table.*(academic_years|academic_terms|class_offerings)|relation.*(academic_years|academic_terms|class_offerings).*does not exist/i.test(error.message || '')));
}
export async function loadAcademicWorkspace() {
  const first=await supabase.from('academic_years').select('id,label,starts_on,ends_on').order('starts_on',{ascending:false});
  if (first.error) {
    if(isAcademicSchemaMissing(first.error)) return {installed:false};
    throw new Error(first.error.message);
  }
  const [terms,offerings,meetings,enrollments,roster,sections,subjects] = await Promise.all([
    paged('academic_terms','id,academic_year_id,name,starts_on,ends_on,status'),
    paged('class_offerings','id,academic_term_id,section_id,subject_id,instructor_user_id,program,year_level,room,status'),
    paged('class_offering_meetings','id,offering_id,weekday,start_time,end_time'),
    paged('class_enrollments','id,offering_id,student_number,surname_at_enrollment,first_name_at_enrollment,middle_initial_at_enrollment,section_id_at_enrollment,enrolled_on,status,status_reason'),
    paged('student_roster','student_number,section_id,surname,first_name,middle_initial,active','student_number',[['active',true]]),
    paged('sections','id,code'),
    paged('subjects','id,code,name'),
  ]);
  return {installed:true,years:first.data,terms,offerings,meetings,enrollments,roster,sections,subjects};
}
async function academicRpc(name,args) {
  return requireData(await supabase.rpc(name,args));
}
export const createAcademicYear=(label,startsOn,endsOn)=>academicRpc('admin_create_academic_year',{
  p_label:label,p_starts_on:startsOn,p_ends_on:endsOn,
});
export const createAcademicTerm=(yearId,name,startsOn,endsOn)=>academicRpc('admin_create_academic_term',{
  p_academic_year_id:Number(yearId),p_name:name,p_starts_on:startsOn,p_ends_on:endsOn,
});
export const createClassOffering=(termId,sectionId,subjectId,program,yearLevel,room)=>
  academicRpc('admin_create_class_offering',{
    p_academic_term_id:Number(termId),p_section_id:Number(sectionId),p_subject_id:Number(subjectId),
    p_program:program||null,p_year_level:yearLevel?Number(yearLevel):null,p_room:room||null,
  });
export const enrollClassStudents=(offeringId,studentNumbers,enrolledOn)=>
  academicRpc('admin_enroll_class_students',{
    p_offering_id:Number(offeringId),p_student_numbers:studentNumbers,p_enrolled_on:enrolledOn,
  });
export const updateEnrollmentStatus=(id,status,reason)=>
  academicRpc('admin_update_enrollment_status',{
    p_enrollment_id:Number(id),p_status:status,p_reason:reason,
  });
export const archiveClassOffering=(id)=>academicRpc('admin_archive_class_offering',{p_offering_id:Number(id)});

export const offeringTitle=(offering,sections,subjects)=>
  `${sections.find(s=>Number(s.id)===Number(offering.section_id))?.code||'Section'} · ${subjects.find(s=>Number(s.id)===Number(offering.subject_id))?.code||'Subject'}`;
export const enrollmentName=(student)=>`${student.surname_at_enrollment}, ${student.first_name_at_enrollment} ${student.middle_initial_at_enrollment}`.trim();
