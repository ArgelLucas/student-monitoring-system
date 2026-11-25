// Composable view helpers, with no server authorization logic.
export function sectionSubjectPairs(schedules) {
  return [...new Set(schedules.map((s) => `${s.section_id}:${s.subject_id}`))].map((key) => {
    const [section_id, subject_id] = key.split(':').map(Number);
    return { section_id, subject_id };
  });
}

export function studentAttendanceSummary(attendance = [], windows = []) {
  const windowsById = new Map(windows.map((w) => [Number(w.id), w]));
  const recent = attendance.filter((r) => r.attendance_window_id != null);
  return {
    recentCheckins: recent.length,
    latest: recent[0] || null,
    lastMeetingDate: recent.length ? windowsById.get(Number(recent[0].attendance_window_id))?.meeting_date || null : null,
  };
}
