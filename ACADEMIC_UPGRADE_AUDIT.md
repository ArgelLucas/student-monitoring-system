# StudentMonitor academic-platform upgrade: Phase 1 audit and stabilization

Status: **proposed branch / review only**. This phase does **not** change live Supabase,
deploy new academic tables, import student records or publish grades.

## Verified repository findings

1. **Duplicate attendance migration version:** two different files named `202611260006_*.sql` were committed. One (`006_admin_attendance_override.sql`) contains a malformed PL/pgSQL dollar delimiter (`AS $` / `$;`) in a function definition, so an attempt to apply it fails. The authoritative migration is now `006_attendance_override.sql`. **If either version was executed against a database, review the actual schema and routine definitions before applying anything again.** Do not assume migration filenames establish execution history.
2. **Daily override expiry:** the original authoritative override could expire on the next Philippine calendar day. The existing one-window-per-schedule/day constraint and the student RPC require a Philippine meeting date; a cross-midnight window would appear open but could not be checked into the next day. The proposed migration now caps override expiry at the next Manila midnight.
3. **Roster pagination:** `getOfficialRoster()` previously used one default PostgREST select. Supabase can cap result sets, creating silent omissions in class rosters and attendance reports. Now load ordered pages of 500 and fail explicitly beyond a 10,000-row safety ceiling.
4. **Historic membership:** attendance and reports are currently assembled using the *current* student section or roster, not a durable class-specific enrollment snapshot. Changing a student's section can alter old attendance report membership. Future attendance-grading must wait for a class/enrollment model.
5. **Gradebook:** existing `class_record_assessments` and `class_record_scores` support raw scores and categories; missing functionality includes assessment publication, grade finalization, revision rules, term boundaries and attendance-grade linkage.
6. **Student profile vs enrollment:** the current schema has a primary section and subject on `student_profiles`. A true multi-class system must add an enrollment junction rather than duplicating student identities.
7. **Security:** the schema uses RLS and privileged RPCs, but live Supabase project settings, actual applied migrations, RLS behavior under student sessions, and authorization paths have not yet been exercised end to end. Do not call it production-ready.
8. **Time-based attendance:** normal open/check-in is gated by PostgreSQL PH date/time. Automatic future session creation or auto-finalization while all browsers are closed has not been implemented; scheduled availability and an automatically persisted session are different behaviors.

## Workbook audit (structural)

Input: `Grading Sheet 2026 - 2027.xlsm` (private; NOT committed).
The file contains **19 worksheets**, including `INSTRUCTION `, `DATA ENTRY`, several subject-specific class sheets for CT 2A, 2B, 3A, 3B, plus empty/placeholder section sheets and subjects outside the current six-section timetable. It contains tens of thousands of formulas. Workbook formula fidelity (including named ranges, cross-sheet dependencies, equivalency mapping and cached errors) **has not yet been verified line by line**. Macros were not executed.

Do not import historic scores, grades, or student identities into the database solely by matching worksheet titles. Confirm academic year, semester, section and subject for each sheet.

## Proposed relational model (next phases)

- `academic_years`, `academic_terms` — explicit active/archived periods
- `class_offerings` — subject, instructor, room, section, term; unique offering ID
- `class_enrollments` — unique (offering, student), with effective dates and immutable history
- `class_meetings` / `attendance_sessions` — occurrence date, schedule relationship, lifecycle
- `attendance_entries` — unique (attendance session, enrollment), status, check-in timestamp, correction provenance
- `grading_periods`, `grading_policies`, `assessments`, `assessment_scores`
- `grade_publications`, `grade_finalizations`, `grade_revisions`
- `student_notes`, `academic_interventions`, `audit_logs`

Migrate non-destructively: add tables, backfill with reviewable mapping, validate counts and
RLS, switch reads gradually, then deprecate legacy writes only after comprehensive checks.
Do not overwrite existing attendance or class records.

## Implementation order / acceptance criteria

1. **Phase 1 — Stability:** single valid migration 006, paged roster reads, regression coverage, PR-only CI. No live data migration.
2. **Phase 2 — Academic class identity:** offerings by academic year/term, enrollment junction and historical membership with safe backfill. Verify one student can enroll in two subjects.
3. **Phase 3 — Attendance calendar:** occurrences, controlled automatic scheduling, finalized statuses, corrections and absence policy. Verify server-side operation with browser closed.
4. **Phase 4 — Grading engine:** centrally tested computation matching workbook formulas; independent term and final grade; configurable policies; incomplete scores remain null.
5. **Phase 5 — Integration:** attendance-to-grade linkage for eligible finalized sessions; student portal publication and privacy.
6. **Phase 6 — Imports / exports:** validated workbook import preview, duplicate detection, sheet mapping, instructor sign-off, auditable persistence, Excel/CSV/PDF.
7. **Phase 7 — End-to-end QA:** protected read/write testing using instructor and student accounts; mobile/keyboard QA; test builds and real GitHub Pages.

## Phase 1 files changed

- Deleted: `supabase/migrations/202611260006_admin_attendance_override.sql`
- Modified: `supabase/migrations/202611260006_attendance_override.sql`
- Modified: `src/lib/api.js`
- Modified: `tests/admin-attendance-override.test.js`
- Added: `tests/academic-stabilization.test.js`
- Added: `.github/workflows/academic-pr-check.yml`
- Added: this audit document

## Release / operational cautions

Before promoting the branch to `main`, inspect its CI results. On the Supabase side,
make a restorable database backup, inspect actual columns/function bodies and applied migrations.
The SQL changes in this PR are source/schema fixes; **GitHub Pages never applies them**.
Do not run both SQL files numbered 006; only the authoritative validated one may be considered,
after reviewing the real database state. No private roster or grading workbook is included.
