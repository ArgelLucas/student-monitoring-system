const isoDate = d => d.toISOString().slice(0,10);
const fromIso = d => new Date(`${d}T00:00:00.000Z`);
const dateOffset = (d,n) => { const o=fromIso(d);o.setUTCDate(o.getUTCDate()+n);return isoDate(o); };
const dayDifference = (a,b) => Math.round((fromIso(a)-fromIso(b))/86400000);
export function attendanceTrend(data, endDate, range = 7) {
  const days = [7,30,90].includes(Number(range)) ? Number(range) : 7;
  const firstDate = dateOffset(endDate, 1-days);
  const bucketSpan = days===7?1:days===30?5:15;
  const bucketCount = Math.ceil(days/bucketSpan);
  const buckets = Array.from({length:bucketCount},(_,i)=>{
    const start = dateOffset(firstDate,i*bucketSpan);
    const end = dateOffset(firstDate,Math.min(days-1,(i+1)*bucketSpan-1));
    return {start,end,expected:0,present:0};
  });
  const schedules = new Map(data.schedules.map(s=>[Number(s.id),s]));
  const studentsBySection = new Map();
  for (const p of data.profiles) {
    if (!p.is_approved) continue;
    const key = Number(p.section_id);
    if (!studentsBySection.has(key)) studentsBySection.set(key,new Set());
    studentsBySection.get(key).add(String(p.user_id));
  }
  const attendanceByWindow = new Map();
  for (const a of data.attendance) {
    if (a.attendance_window_id==null) continue;
    const id = Number(a.attendance_window_id);
    if (!attendanceByWindow.has(id)) attendanceByWindow.set(id,new Set());
    attendanceByWindow.get(id).add(String(a.student_id));
  }
  for (const w of data.windows) {
    if (!w.opened_at || w.meeting_date<firstDate || w.meeting_date>endDate) continue;
    const schedule=schedules.get(Number(w.schedule_id));
    if (!schedule) continue;
    const students=studentsBySection.get(Number(schedule.section_id));
    if (!students || students.size===0) continue;
    const index=Math.floor(dayDifference(w.meeting_date,firstDate)/bucketSpan);
    const b=buckets[index];
    if (!b) continue;
    b.expected+=students.size;
    const actual=attendanceByWindow.get(Number(w.id)) || new Set();
    for (const studentId of actual) if (students.has(studentId)) b.present++;
  }
  return buckets.map((b)=>({
    ...b,
    rate: b.expected ? Math.round(1000*b.present/b.expected)/10 : null,
    label: days===7 ? new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'UTC'}).format(fromIso(b.start))
      : `${Number(b.start.slice(5,7))}/${Number(b.start.slice(8,10))}`,
  }));
}

