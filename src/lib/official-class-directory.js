// Administrative class directory derived from the instructor's official roster
// and the published class timetable. No enrollment table or manual enrollment.
// Section identity is NOT a claim that a student attended every subject or term.
export const VERIFIED_SECTION_CODES=Object.freeze(['1A','1B','2A','2B','3A','3B']);

export function yearForSection(code) {
  const value=String(code||'').trim().toUpperCase();
  return /^[123][AB]$/.test(value) ? Number(value[0]) : null;
}

function nameOf(student){
  return String(student.full_name || [
    student.surname ? `${student.surname},` : '',
    student.first_name || '',
    student.middle_initial && student.middle_initial!=='N/A' ? student.middle_initial : ''
  ].filter(Boolean).join(' ')).trim();
}
const normalized=s=>String(s||'').trim().toLocaleLowerCase('en');
const orderedNames=(a,b)=>normalized(a.surname).localeCompare(normalized(b.surname),'en')||
  normalized(a.first_name).localeCompare(normalized(b.first_name),'en')||
  String(a.student_number).localeCompare(String(b.student_number),'en');
const scheduleOrder=(a,b)=>Number(a.weekday)-Number(b.weekday)||
  String(a.start_time).localeCompare(String(b.start_time));

export function buildOfficialClassDirectory({sections=[],subjects=[],schedules=[],roster=[],profiles=[]}={}) {
  const sourceSections=new Map(sections.map(s=>[String(s.code||'').trim().toUpperCase(),s]));
  const subjectNames=new Map(subjects.map(s=>[Number(s.id),s]));
  const profilesByNumber=new Map(profiles.filter(p=>p.student_number)
    .map(p=>[String(p.student_number),p]));
  const profilesByUser=new Map(profiles.map(p=>[String(p.user_id),p]));
  return VERIFIED_SECTION_CODES.map(code=>{
    const section=sourceSections.get(code);
    const id=section?.id;
    const members=id==null?[]:roster.filter(r=>Number(r.section_id)===Number(id)&&r.active!==false)
      .sort(orderedNames).map(r=>{
        const profile=profilesByNumber.get(String(r.student_number))||
          (r.linked_user_id?profilesByUser.get(String(r.linked_user_id)):null);
        return {
          studentNumber:String(r.student_number),
          fullName:nameOf(r),
          sourceTerm:String(r.source_term||'Unspecified'),
          needsReview:Boolean(r.name_needs_review),
          accountStatus:!profile?'Not registered':profile.is_approved?'Approved':'Pending approval'
        };
      });
    // Subjects derive from actual class_schedules, not the grading workbook's
    // other schools/years or the old Phase 2 enrollment model.
    const subjectMap=new Map();
    for(const s of (id==null?[]:schedules.filter(row=>Number(row.section_id)===Number(id)))){
      const subjectId=Number(s.subject_id);
      if(!subjectMap.has(subjectId)){
        const metadata=subjectNames.get(subjectId);
        subjectMap.set(subjectId,{id:subjectId,code:metadata?.code||'Subject',name:metadata?.name||'',meetings:[]});
      }
      subjectMap.get(subjectId).meetings.push(s);
    }
    const classSubjects=[...subjectMap.values()]
      .map(s=>({...s,meetings:s.meetings.sort(scheduleOrder)}))
      .sort((a,b)=>a.code.localeCompare(b.code,'en',{numeric:true}));
    return {
      code,year:yearForSection(code),id:id==null?null:Number(id),
      members,studentCount:members.length,
      pendingReview:members.filter(m=>m.needsReview).length,
      sourceTerms:[...new Set(members.map(m=>m.sourceTerm))].sort(),
      subjects:classSubjects
    };
  });
}

export function searchOfficialStudents(members,query){
  const q=normalized(query);
  if(!q)return members;
  return members.filter(m=>
    normalized(`${m.fullName} ${m.studentNumber} ${m.accountStatus}`).includes(q));
}
