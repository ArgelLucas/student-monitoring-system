// Instructor gradebook calculations modeled on the uploaded grading workbook.
// This is presentation logic only. Supabase RLS controls all grade data access.
export const CLASS_RECORD_WEIGHTS = Object.freeze({
  Activities: 0.20,
  Quizzes: 0.10,
  Attendance: 0.10,
  Projects: 0.30,
  Examinations: 0.30,
});
export const CLASS_RECORD_TERMS = Object.freeze(['Midterm', 'Final']);
export const CLASS_RECORD_CATEGORIES = Object.freeze(Object.keys(CLASS_RECORD_WEIGHTS));
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

// This scale matches DATA ENTRY's EQUIVALENT lookup thresholds in the source workbook.
export function classRecordEquivalent(percentage) {
  if (!Number.isFinite(percentage)) return null;
  const scale = [[96.5, 1], [93.5, 1.25], [90.5, 1.5], [87.5, 1.75],
    [84.5, 2], [81.5, 2.25], [78.5, 2.5], [75.5, 2.75], [74.5, 3]];
  return scale.find(([min]) => percentage >= min)?.[1] ?? 5;
}

export function scoreKey(assessmentId, studentNumber) {
  return `${assessmentId}:${studentNumber}`;
}

export function calculateTermGrade(assessments, scores, studentNumber) {
  const groups = {};
  let weighted = 0;
  let missing = 0;
  for (const [category, weight] of Object.entries(CLASS_RECORD_WEIGHTS)) {
    const list = assessments.filter(item => item.category === category);
    let earned = 0;
    let possible = 0;
    for (const item of list) {
      const value = scores[scoreKey(item.id, studentNumber)];
      if (value === '' || value === null || value === undefined || !Number.isFinite(Number(value))) {
        missing++;
      } else {
        earned += Number(value) / Number(item.max_score);
        possible++;
      }
    }
    if (!list.length) missing++;
    const average = possible ? earned / possible * 100 : null;
    const contribution = average === null ? null : average * weight;
    if (contribution !== null) weighted += contribution;
    groups[category] = {count:list.length, scored:possible, percent:average === null ? null : round2(average),
      weighted: contribution === null ? null : round2(contribution), weight};
  }
  const complete = missing === 0;
  const grade = complete ? round2(weighted) : null;
  return {groups, grade, complete, missing, equivalent: complete ? classRecordEquivalent(grade) : null,
    remark: complete ? (grade >= 74.5 ? 'Passed' : 'Failed') : 'In progress'};
}

export function calculateFinalGrade(midterm, finalTerm) {
  if (!midterm?.complete || !finalTerm?.complete) return {grade:null,equivalent:null,remark:'In progress'};
  const grade = round2((midterm.grade + finalTerm.grade) / 2);
  return {grade, equivalent:classRecordEquivalent(grade),remark:grade >= 74.5 ? 'Passed' : 'Failed'};
}

const csvSafe = value => {
  let text = String(value ?? '');
  if (/^\s*[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export function classRecordsCsv(roster, assessments, scores, term, section, subject) {
  const heading = ['Student number','Surname, First Name MI','Section','Subject','Term',
    ...assessments.map(a => `${a.category}: ${a.title} / ${a.max_score}`),
    ...CLASS_RECORD_CATEGORIES.map(c => `${c} weighted`),'Term grade','Equivalent','Remark'];
  const rows = roster.map(student => {
    const result = calculateTermGrade(assessments,scores,student.student_number);
    return [student.student_number,student.full_name,section,subject,term,
      ...assessments.map(a => scores[scoreKey(a.id,student.student_number)] ?? ''),
      ...CLASS_RECORD_CATEGORIES.map(c => result.groups[c].weighted ?? ''),
      result.grade ?? '',result.equivalent ?? '',result.remark];
  });
  return '\uFEFF' + [heading,...rows].map(row => row.map(csvSafe).join(',')).join('\r\n');
}

export function validateScore(value, maximum) {
  if (value === '' || value === null || value === undefined) return null; // blank means delete score
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value)) || Number(value)>Number(maximum))
    return `Use a score from 0 to ${maximum} with at most 2 decimal places`;
  return null;
}
