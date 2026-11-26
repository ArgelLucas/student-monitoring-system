import { supabase } from './supabase.js';

function ensure(data, error) {
  if (error) throw new Error(error.message || 'Request failed');
  return data;
}

export async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  return ensure(data, error);
}

// The Supabase REST API often caps each response at 1000 rows; fetch complete
// small-school datasets in pages instead of silently displaying partial totals.
// 10,000 rows is a safety ceiling: larger deployments require server-side
// aggregated reporting and a dedicated paginated endpoint.
export async function fetchPaged(table, fields, orderKey, maxRows = 10000) {
  const pageSize = 500;
  const collected = [];
  for (let offset = 0; offset <= maxRows; offset += pageSize) {
    const { data, error } = await supabase.from(table).select(fields)
      .order(orderKey, { ascending: false }).range(offset, offset + pageSize - 1);
    ensure(data, error);
    collected.push(...data);
    if (data.length < pageSize) return collected;
  }
  throw new Error(`The ${table} dataset is too large for this dashboard; use paginated reporting.`);
}

export async function getContext({ touchSession = true } = {}) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  if (touchSession) await rpc('touch_portal_session');
  else if (!(await rpc('portal_session_active'))) throw new Error('Portal session has expired; sign in again');

  const admin = await rpc('is_admin');
  if (admin) return { user: data.user, admin: true, profile: null };

  let result = await supabase.from('student_profiles')
    .select('user_id,student_number,surname,first_name,middle_initial,sex,age,section_id,subject_id,github_username,is_approved,completed_at')
    .eq('user_id', data.user.id).maybeSingle();
  if (isMissingRosterColumn(result.error)) {
    result = await supabase.from('student_profiles')
      .select('user_id,surname,first_name,middle_initial,sex,age,section_id,subject_id,github_username,is_approved,completed_at')
      .eq('user_id', data.user.id).maybeSingle();
  }
  return { user: data.user, admin: false, profile: ensure(result.data, result.error) };
}

export async function getCatalog() {
  const [sections, subjects, sectionSubjects] = await Promise.all([
    supabase.from('sections').select('id,code').eq('is_active', true).order('code'),
    supabase.from('subjects').select('id,code,name').eq('is_active', true).order('code'),
    rpc('list_section_subjects'),
  ]);
  return {
    sections: ensure(sections.data, sections.error),
    subjects: ensure(subjects.data, subjects.error),
    sectionSubjects,
  };
}

export async function getMyAttendance(userId) {
  const { data, error } = await supabase.from('attendance_records')
    .select('id,attendance_date,attendance_window_id,marked_at,status,subject_id')
    .eq('student_id', userId).order('marked_at', { ascending: false }).limit(250);
  return ensure(data, error);
}

export async function getMyClassData(sectionId) {
  const [schedules, windows] = await Promise.all([
    supabase.from('class_schedules')
      .select('id,section_id,subject_id,weekday,start_time,end_time')
      .eq('section_id', sectionId).order('weekday').order('start_time'),
    supabase.from('attendance_windows')
      .select('id,schedule_id,meeting_date,is_open,opened_at,expires_at')
      .order('meeting_date', { ascending: false }).limit(500),
  ]);
  return { schedules: ensure(schedules.data, schedules.error), windows: ensure(windows.data, windows.error) };
}

function isMissingRosterColumn(error) {
  return Boolean(error && (/student_number.*(does not exist|not found)|column.*student_number|could not find.*student_number/i.test(error.message || '')
    || error.code === '42703' || error.code === 'PGRST204'));
}

async function getProfilesForAdmin() {
  const fields = 'user_id,surname,first_name,middle_initial,sex,age,section_id,subject_id,github_username,is_approved,updated_at';
  try { return await fetchPaged('student_profiles', 'user_id,student_number,surname,first_name,middle_initial,sex,age,section_id,subject_id,github_username,is_approved,updated_at', 'user_id'); }
  catch (error) {
    if (!isMissingRosterColumn(error)) throw error;
    return fetchPaged('student_profiles', fields, 'user_id');
  }
}

async function getOfficialRoster() {
  const result = await supabase.from('student_roster')
    .select('student_number,section_id,surname,first_name,middle_initial,full_name,linked_user_id,active,name_needs_review,source_term')
    .eq('active', true).order('section_id').order('surname');
  if (!result.error) return { rows: result.data, available: true };
  // During setup the new schema may not yet be installed. Preserve admin
  // access and display an upgrade notice instead of crashing the dashboard.
  if (['42P01', 'PGRST205', 'PGRST200'].includes(result.error.code) ||
      /could not find the table.*student_roster|relation.*student_roster.*does not exist/i.test(result.error.message || '')) {
    return { rows: [], available: false };
  }
  throw new Error(result.error.message || 'Could not load the official student roster');
}

async function getAuditWithCompatibility() {
  const fields = 'id,actor_id,action,subject_user_id,created_at,details';
  const first = await supabase.from('audit_logs').select(fields)
    .order('created_at', { ascending: false }).limit(150);
  if (!first.error) return { records: first.data, warnings: [] };
  // Older v2 databases don't have audit_logs.details. Show an actionable
  // migration warning while keeping the otherwise protected dashboard usable.
  if (!/column.*audit_logs\.details.*does not exist|column.*details.*does not exist/i.test(first.error.message || '')) {
    throw new Error(first.error.message || 'Could not fetch audit history');
  }
  const fallback = await supabase.from('audit_logs')
    .select('id,actor_id,action,subject_user_id,created_at')
    .order('created_at',{ascending:false}).limit(150);
  return {
    records: ensure(fallback.data,fallback.error).map(item => ({...item, details:{}})),
    warnings: ['Supabase migration 003 has not been fully applied. Run 202611250003_admin_reporting.sql to enable detailed audit logs and class-assignment corrections.'],
  };
}

export async function getAdminData() {
  const [profiles, attendance, schedulesResult, windows, catalog, auditResult, rosterResult] = await Promise.all([
    getProfilesForAdmin(),
    fetchPaged('attendance_records',
      'id,student_id,subject_id,attendance_date,attendance_window_id,marked_at,status', 'id'),
    supabase.from('class_schedules')
      .select('id,section_id,subject_id,weekday,start_time,end_time')
      .order('weekday').order('start_time'),
    fetchPaged('attendance_windows',
      'id,schedule_id,meeting_date,is_open,opened_at,expires_at', 'id'),
    getCatalog(),
    getAuditWithCompatibility(),
    getOfficialRoster(),
  ]);
  return {
    profiles, attendance,
    schedules: ensure(schedulesResult.data, schedulesResult.error),
    windows, audit: auditResult.records, roster: rosterResult.rows, rosterReady: rosterResult.available,
    schemaWarnings: [...auditResult.warnings, ...(rosterResult.available ? [] : ['Student roster migration 004 has not been applied. Daily roster reporting and student-number lookup are unavailable.'])], ...catalog,
  };
}

// Instructor-only class record reads/writes. Tables in migration 005 enforce RLS.
export async function getClassRecordData(sectionId, subjectId, term, academicYear, semester) {
  const [roster, items] = await Promise.all([
    supabase.from('student_roster')
      .select('student_number,full_name,section_id,active,name_needs_review')
      .eq('section_id', sectionId).eq('active',true).order('full_name'),
    supabase.from('class_record_assessments')
      .select('id,section_id,subject_id,term,category,title,max_score,assessment_date,academic_year,semester')
      .eq('section_id',sectionId).eq('subject_id',subjectId).eq('term',term)
      .eq('academic_year',academicYear).eq('semester',semester)
      .order('assessment_date').order('id'),
  ]);
  const assessments = ensure(items.data,items.error);
  const students = ensure(roster.data,roster.error);
  if (!assessments.length) return {students,assessments,scores:[]};
  const scores=[];
  // PostgREST often limits individual responses to 1000 rows. Never silently
  // drop scores from a larger class gradebook.
  for(let offset=0;offset<20000;offset+=500){
    const result=await supabase.from('class_record_scores')
      .select('assessment_id,student_number,score,updated_at')
      .in('assessment_id', assessments.map(a=>a.id))
      .order('assessment_id').order('student_number')
      .range(offset,offset+499);
    const page=ensure(result.data,result.error);
    scores.push(...page);
    if(page.length<500) return {students,assessments,scores};
  }
  throw new Error('Class records exceed the safe page limit; contact the administrator');
}

export async function addClassRecordAssessment(item) {
  const {data,error} = await supabase.from('class_record_assessments').insert(item)
    .select('id').single();
  return ensure(data,error);
}

export async function removeClassRecordAssessment(id) {
  const {error} = await supabase.from('class_record_assessments').delete().eq('id',id);
  ensure(null,error);
}

export async function persistClassRecordScores(changes) {
  // One PostgreSQL transaction: either every score change succeeds, or none do.
  // The SECURITY DEFINER RPC verifies admin access and records audit history.
  return rpc('save_class_record_scores', {p_changes:changes});
}
