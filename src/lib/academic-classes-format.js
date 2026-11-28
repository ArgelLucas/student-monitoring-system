// Pure display helpers; no Supabase dependency (also safe for node:test).
export const offeringTitle=(offering,sections,subjects)=>
  `${sections.find(s=>Number(s.id)===Number(offering.section_id))?.code||'Section'} · ${subjects.find(s=>Number(s.id)===Number(offering.subject_id))?.code||'Subject'}`;
export const enrollmentName=(student)=>`${student.surname_at_enrollment}, ${student.first_name_at_enrollment} ${student.middle_initial_at_enrollment}`.trim();
