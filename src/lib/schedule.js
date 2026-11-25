// Browser clock is for DISPLAY ONLY. All permission/time checks happen in SQL.
const WEEKDAYS = ['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

export function manilaClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', weekday: 'long', year: 'numeric',
    month: '2-digit', day: '2-digit', hour: '2-digit',
    minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAYS.indexOf(get('weekday')),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

export function timeLabel(time) {
  if (!/^\d{2}:\d{2}(?::\d{2})?$/.test(String(time || ''))) return '—';
  const [h, minute] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(minute).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export const weekdayLabel = (day) => WEEKDAYS[Number(day)] || 'Unknown day';

export function classInProgress(schedule, clock = manilaClock()) {
  const toMinutes = (time) => {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
  };
  return Number(schedule.weekday) === clock.weekday &&
    clock.minutes >= toMinutes(schedule.start_time) &&
    clock.minutes < toMinutes(schedule.end_time);
}

export function todayWindow(schedule, windows, clock = manilaClock()) {
  return windows.find((window) => Number(window.schedule_id) === Number(schedule.id) &&
    window.meeting_date === clock.date) || null;
}

export function windowIsOpen(window, date = new Date()) {
  return Boolean(window && window.is_open &&
    Date.parse(window.opened_at) <= date.getTime() &&
    date.getTime() < Date.parse(window.expires_at));
}

export function scheduleSort(a, b) {
  return Number(a.weekday) - Number(b.weekday) ||
    a.start_time.localeCompare(b.start_time) || Number(a.section_id) - Number(b.section_id);
}
