# Update: manual enrollment has been retired

The previous Phase 2 class-enrollment workflow was replaced at the instructor's request by **roster-led class management**.

The authoritative class lists are the existing 1A, 1B, 2A, 2B, 3A and 3B sections from the instructor's reviewed source spreadsheets. **Never publish the actual student names, student numbers or original workbook in GitHub.**

## Verified sources (private, not uploaded to GitHub)

- First year: 1A (25 import-ready entries), 1B (26 import-ready entries). Source term: **2nd Semester**.
- Second year: 2A (33 import-ready entries), 2B (31 import-ready entries). Source term: **1st Semester**.
- Third year: 3A (43 import-ready entries), 3B (41 import-ready entries). Source term: **1st Semester**.
- In total **199 import-ready student identities** across six sections, plus **two conflicting 3B entries excluded from the private import**. Some names need human review.

**These numbers describe the original reviewed private roster; they are not hard-coded into the UI or guaranteed to match the currently imported database.**

## New workflow

Admin → **Classes** is the only class navigation entry. It now includes:
1. Year-level tabs (1st, 2nd, 3rd).
2. Section selector (A/B).
3. Read-only, searchable official student roster from Supabase (migration 004 and the reviewed private import).
4. Subject timetable for the section, sourced from the existing class schedule table.
5. Portal approval statuses and name-review flags.
6. Existing attendance windows, Close and Force open buttons, unchanged.

A student assigned to 2A appears in the section directory once and can be shown with the independent timetable for CT 223a and QCA 113. Attendance records and grades remain **per subject and meeting** as before.

## Files and deployment

- Added: `src/lib/official-class-directory.js`, `src/components/OfficialClassDirectory.jsx`, `src/styles/official-class-directory.css`, `tests/official-class-directory.test.js`.
- Modified: `src/pages/AdminPages.jsx`, `src/App.jsx`.
- Removed unused frontend modules and old manual-enrollment tests: `AcademicClassesPage.jsx`, `academic-classes.css`, `academic-classes.js`, `academic-classes-format.js`, `academic-classes.test.js`.
- The legacy `#/admin/academic-classes` route redirects to `#/admin/classes`.
- No npm dependency or environment variable changes.
- **Migration 007 remains in source control for migration history and safety**, but the new UI does not read, modify or depend on those academic-year, offering or enrollment tables. DO NOT drop these tables if they were already installed; doing so could destroy data. No automatic rollback or destructive SQL was run.
- No new SQL migration is required for this UI change. It requires the pre-existing official roster (migration 004 plus verified private roster import) for student lists.

## Tests and limitations

PR checks run source validation, automated tests and production React build. The source workbook was inspected and source term differences preserved. Live Supabase roster counts, migration state, and full instructor/student integration are not accessible from GitHub; confirm them in the admin portal.

The directory reflects the **current official section roster**, not a historical, term-frozen enrollment snapshot. Showing a section list does not prove enrollment in an earlier semester or a student's attendance. Academic-year-specific reports and official historic grade finalization should continue to require an instructor-reviewed, term-scoped data model in a future phase.

## Safe publication

Review the PR checks, merge into `main`, then monitor GitHub Actions. Refresh the live website and open Admin → Classes. Compare visible names and counts with the private instructor review workbook. If no names appear, check migration 004/official roster import in Supabase; do not hardcode student names into the frontend.
