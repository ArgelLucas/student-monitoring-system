// Presentation-only reporting over RLS-protected rows returned by Supabase.
// Never used for authorization. An unrecorded check-in is not automatically an
// excused/unexcused absence; the instructor must classify absences separately.
import { windowIsOpen } from './schedule.js';

export function buildMeetingReport({ profiles = [], schedules = [], windows = [], attendance = [], sections = [], subjects = [] },
  { date = '', sectionId = '', subjectId = '' } = {}, now = new Date()) {
  const bySchedule = new Map(schedules.map((s) => [Number(s.id), s]));
  const bySection = new Map(sections.map((s) => [Number(s.id), s.code]));
  const bySubject = new Map(subjects.map((s) => [Number(s.id), s.code]));
  const checked = new Set(attendance.filter((record) => record.attendance_window_id != null)
    .map((record) => `${record.attendance_window_id}:${record.student_id}`));
  const rows = [];
  for (const window of windows) {
    if (date && window.meeting_date !== date) continue;
    const schedule = bySchedule.get(Number(window.schedule_id));
    if (!schedule) continue;
    if (sectionId && Number(schedule.section_id) !== Number(sectionId)) continue;
    if (subjectId && Number(schedule.subject_id) !== Number(subjectId)) continue;
    for (const p of profiles) {
      if (!p.is_approved || Number(p.section_id) !== Number(schedule.section_id)) continue;
      const present = checked.has(`${window.id}:${p.user_id}`);
      const status = present ? 'Present' : windowIsOpen(window, now) ? 'Open / waiting' : 'Not checked in';
      rows.push({
        date: window.meeting_date,
        section: bySection.get(Number(schedule.section_id)) || '?',
        subject: bySubject.get(Number(schedule.subject_id)) || '?',
        scheduleId: schedule.id,
        windowId: window.id,
        studentId: p.user_id,
        student: `${p.surname}, ${p.first_name} ${p.middle_initial}`.trim(),
        github: p.github_username,
        status,
      });
    }
  }
  return rows.sort((a,b) => b.date.localeCompare(a.date) || a.section.localeCompare(b.section)
    || a.subject.localeCompare(b.subject) || a.student.localeCompare(b.student));
}

export function summarizeMeetingReport(rows) {
  return {
    expected: rows.length,
    present: rows.filter((r) => r.status === 'Present').length,
    waiting: rows.filter((r) => r.status === 'Open / waiting').length,
    unrecorded: rows.filter((r) => r.status === 'Not checked in').length,
    meetings: new Set(rows.map((r) => r.windowId)).size,
  };
}

export function toCsv(rows, headings = ['Date','Section','Subject','Student','GitHub','Status']) {
  const columns = [
    (r) => r.date, (r) => r.section, (r) => r.subject,
    (r) => r.student, (r) => r.github, (r) => r.status,
  ];
  // Protect Excel/Sheets from formula injection in student-controlled text.
  const cell = (value) => {
    let v = String(value ?? '');
    if (/^[\s]*[=+@\-\t\r]/.test(v)) v = `'${v}`;
    return `"${v.replace(/"/g,'""')}"`;
  };
  return '\uFEFF' + [headings.map(cell).join(','),
    ...rows.map((r) => columns.map((fn) => cell(fn(r))).join(','))].join('\r\n');
}
