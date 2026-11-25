// View-only helpers. Attendance authorization is always decided by Supabase.
export function selectPriorityClass(today = []) {
  const priorities = ['open', 'waiting', 'upcoming', 'recorded', 'closed', 'finished'];
  return [...today].sort((a, b) => priorities.indexOf(a.key) - priorities.indexOf(b.key) || String(a.schedule?.start_time || '').localeCompare(String(b.schedule?.start_time || '')))[0] || null;
}

export function groupStudentSchedule(schedules = []) {
  const groups = new Map();
  for (const schedule of schedules) {
    const day = Number(schedule.weekday);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(schedule);
  }
  return [...groups].sort(([a], [b]) => a - b).map(([weekday, meetings]) => ({
    weekday,
    meetings: [...meetings].sort((a,b)=>String(a.start_time).localeCompare(String(b.start_time))),
  }));
}

const timeMinutes = value => {
  const [hours, minutes] = String(value || '00:00').split(':').map(Number);
  return hours * 60 + minutes;
};

/** Find the next meeting even when today's classes are finished. No fabricated dates. */
export function findNextMeeting(schedules = [], clock = {weekday:1, minutes:0}) {
  const weekday = Number(clock.weekday);
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return null;
  const candidates = schedules.map(schedule => {
    const day = Number(schedule.weekday);
    if (!Number.isInteger(day) || day < 1 || day > 7) return null;
    let daysAway = (day - weekday + 7) % 7;
    // An ongoing class is still relevant; a completed one is next week.
    if (daysAway === 0 && timeMinutes(schedule.end_time) <= clock.minutes) daysAway = 7;
    return {schedule, daysAway, startMinutes: timeMinutes(schedule.start_time)};
  }).filter(Boolean);
  return candidates.sort((a,b)=>a.daysAway - b.daysAway || a.startMinutes-b.startMinutes)[0] || null;
}

/** Only records returned by Supabase appear here; never infer an absence. */
export function groupAttendanceHistory(records = [], subjects = []) {
  const names = new Map(subjects.map(subject=>[Number(subject.id),subject.code]));
  const groups = new Map();
  for (const record of records) {
    const subjectId = Number(record.subject_id);
    if (!groups.has(subjectId)) groups.set(subjectId, {subjectId, subject: names.get(subjectId) || 'Subject', records: []});
    groups.get(subjectId).records.push(record);
  }
  return [...groups.values()].map(group => ({...group, records: [...group.records].sort((a,b)=> String(b.marked_at || '').localeCompare(String(a.marked_at || '')))}))
    .sort((a,b)=>a.subject.localeCompare(b.subject));
}

export function statusExplanation(key) {
  switch (key) {
    case 'open': return 'Your instructor has opened check-in. You can record attendance now.';
    case 'waiting': return 'Class is in progress. Waiting for your instructor to open check-in.';
    case 'upcoming': return 'Class has not started yet. Check-in is not available.';
    case 'recorded': return 'Your attendance was saved for this meeting.';
    case 'closed': return 'Your instructor closed the check-in window.';
    case 'finished': return 'The class has finished. No check-in is available.';
    default: return 'This meeting is not scheduled for today.';
  }
}

// Count recorded check-ins for the current Philippine Monday–Sunday week.
// Dates are local YYYY-MM-DD values supplied by the database; UTC math here
// is only for comparing calendar dates, not deciding check-in permission.
export function recordedThisWeek(records = [], clock = {}) {
  const day = Number(clock.weekday);
  if (!Number.isInteger(day) || day < 1 || day > 7 || !/^\d{4}-\d{2}-\d{2}$/.test(clock.date || '')) return 0;
  const instant = Date.parse(`${clock.date}T00:00:00Z`);
  if (!Number.isFinite(instant)) return 0;
  const monday = instant - (day - 1) * 86400000;
  const nextMonday = monday + 7 * 86400000;
  return records.filter(record => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.attendance_date || '')) return false;
    const time = Date.parse(`${record.attendance_date}T00:00:00Z`);
    return time >= monday && time < nextMonday;
  }).length;
}
