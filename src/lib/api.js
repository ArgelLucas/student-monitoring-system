import { supabase } from './supabase.js';

function ensure(data, error) {
  if (error) throw new Error(error.message || 'Request failed');
  return data;
}

export async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  return ensure(data, error);
}

export async function getContext() {
  // getUser validates the token against the Auth server; do not trust user_metadata.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  await rpc('touch_portal_session');

  const admin = await rpc('is_admin');
  if (admin) return { user: data.user, admin: true, profile: null };

  const profileResult = await supabase.from('student_profiles')
    .select('user_id,surname,first_name,middle_initial,sex,age,section_id,subject_id,github_username,is_approved,completed_at')
    .eq('user_id', data.user.id).maybeSingle();
  const profile = ensure(profileResult.data, profileResult.error);
  return { user: data.user, admin: false, profile };
}

export async function getCatalog() {
  const [sections, subjects] = await Promise.all([
    supabase.from('sections').select('id,code').eq('is_active', true).order('code'),
    supabase.from('subjects').select('id,code,name').eq('is_active', true).order('code'),
  ]);
  return {
    sections: ensure(sections.data, sections.error),
    subjects: ensure(subjects.data, subjects.error),
  };
}

export async function getMyAttendance(userId) {
  const { data, error } = await supabase.from('attendance_records')
    .select('id,attendance_date,marked_at,status,subject_id')
    .eq('student_id', userId).order('attendance_date', { ascending: false }).limit(50);
  return ensure(data, error);
}

export async function getAdminData() {
  const [profiles, attendance, catalog] = await Promise.all([
    supabase.from('student_profiles')
      .select('user_id,surname,first_name,middle_initial,sex,age,section_id,subject_id,github_username,is_approved,updated_at')
      .order('surname').limit(500),
    supabase.from('attendance_records')
      .select('student_id,subject_id,attendance_date,marked_at,status')
      .order('marked_at', { ascending: false }).limit(1000),
    getCatalog(),
  ]);
  return {
    profiles: ensure(profiles.data, profiles.error),
    attendance: ensure(attendance.data, attendance.error),
    ...catalog,
  };
}
