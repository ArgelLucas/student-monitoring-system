import { normalizeGitHubAccount } from './format.js';
import { classInProgress, scheduleSort, timeLabel, todayWindow, windowIsOpen } from './schedule.js';

const VALID_SEX = new Set(['Male', 'Female', 'Prefer not to say']);
const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;

// Client-side feedback only. Supabase's save_student_profile RPC performs the
// authoritative validation, identity matching, and section/subject checks.
export function validateStudentProfile(form, catalog, githubIdentity, approvedProfile = null) {
  const surname = String(form.surname || '').trim();
  const firstName = String(form.first_name || '').trim();
  const middleInitial = String(form.middle_initial || '').trim().toUpperCase();
  const githubUsername = normalizeGitHubAccount(form.github_username);
  const verified = normalizeGitHubAccount(githubIdentity);
  const age = Number(form.age);
  const sectionId = Number(form.section_id);
  const subjectId = Number(form.subject_id);
  const section = catalog?.sections?.find(item => Number(item.id) === sectionId);
  const subject = catalog?.subjects?.find(item => Number(item.id) === subjectId);
  const eligible = catalog?.sectionSubjects?.some(item =>
    Number(item.section_id) === sectionId && Number(item.subject_id) === subjectId
  );

  if (!surname || surname.length > 80) return { error: 'Enter a surname of up to 80 characters.' };
  if (!firstName || firstName.length > 80) return { error: 'Enter a first name of up to 80 characters.' };
  if (!/^(?:[A-Z]|N\/A)$/.test(middleInitial)) return { error: 'Enter one middle initial (A–Z), or N/A if none.' };
  if (!VALID_SEX.has(form.sex)) return { error: 'Select one of the listed sex options.' };
  if (!Number.isInteger(age) || age < 12 || age > 99) return { error: 'Enter a valid age between 12 and 99.' };
  if (!section || !subject || !eligible) return { error: 'Select a subject offered in your selected section.' };
  if (approvedProfile && (
    sectionId !== Number(approvedProfile.section_id) ||
    subjectId !== Number(approvedProfile.subject_id)
  )) return { error: 'Ask your instructor to change an approved section or subject.' };
  if (!verified || !HANDLE_PATTERN.test(verified)) return { error: 'Unable to verify your GitHub identity. Refresh this page and sign in again if needed.' };
  if (!HANDLE_PATTERN.test(githubUsername) || githubUsername !== verified) return { error: `Your GitHub username must match the account you signed in with (@${verified}).` };

  return {
    payload: {
      p_surname: surname,
      p_first_name: firstName,
      p_middle_initial: middleInitial,
      p_sex: form.sex,
      p_age: age,
      p_section_id: sectionId,
      p_subject_id: subjectId,
      p_github_username: githubUsername,
    },
  };
}

export const classTime = schedule => `${timeLabel(schedule.start_time)} – ${timeLabel(schedule.end_time)}`;

function toMinutes(time) {
  const [hour, minute] = String(time).split(':').map(Number);
  return hour * 60 + minute;
}

// Visual state only. SQL is authoritative for opening and marking attendance.
export function studentClassStatus(schedule, data, clock, now = new Date()) {
  const window = todayWindow(schedule, data.windows || [], clock);
  const recorded = Boolean(window && (data.attendance || []).some(
    record => Number(record.attendance_window_id) === Number(window.id)
  ));
  if (recorded) return { key: 'recorded', label: 'Check-in recorded', tone: 'good', canCheckIn: false, window };
  if (Number(schedule.weekday) !== clock.weekday) return { key: 'other-day', label: 'Not today', tone: 'muted', canCheckIn: false, window };
  if (clock.minutes < toMinutes(schedule.start_time)) return { key: 'upcoming', label: 'Upcoming today', tone: 'muted', canCheckIn: false, window };
  if (!classInProgress(schedule, clock)) return { key: 'finished', label: 'Class finished', tone: 'muted', canCheckIn: false, window };
  if (windowIsOpen(window, now)) return { key: 'open', label: 'Attendance open', tone: 'good', canCheckIn: true, window };
  if (window) return { key: 'closed', label: 'Check-in closed', tone: 'muted', canCheckIn: false, window };
  return { key: 'waiting', label: 'Waiting for instructor', tone: 'warn', canCheckIn: false, window };
}

export function studentScheduleSummary(data, clock, now = new Date()) {
  const schedules = [...(data?.schedules || [])].sort(scheduleSort);
  const today = schedules.filter(s => Number(s.weekday) === clock.weekday);
  const statuses = today.map(s => ({ schedule: s, ...studentClassStatus(s, data, clock, now) }));
  return {
    today: statuses,
    week: schedules,
    checkedIn: statuses.filter(s => s.key === 'recorded').length,
    open: statuses.filter(s => s.canCheckIn).length,
  };
}
