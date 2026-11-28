# StudentMonitor Phase 3 — Attendance calendar, class registers and correction audit

**Release status:** proposed feature branch / review only. **No Supabase production migration has been executed.** GitHub Pages does not apply database migrations.

## Instructor workflow

Admin → **Attendance** becomes a month calendar with day selection.
- Each date shows real scheduled meeting slots and any extra attendance session created through the existing **Classes → Force Open** control.
- The chosen date displays its sections and subjects. Click a session to see student check-in statuses.
- If the instructor has never opened attendance, the calendar shows **Scheduled · not opened** with no attendance register and **no absent students**.
- For windows created after migration 008, a roster snapshot is captured automatically when the session first opens, including students without a GitHub account.
- Instructors can correct a captured student's status to **Present, Late, Absent, Excused, Not Yet Recorded**. A reason (8–500 chars) is mandatory; the audit log records the prior and new values. Original student check-in receipts in `attendance_records` are not deleted or edited.
- After an instructor has closed a session or its check-in window has expired, they can **Finalize**. By default missing check-ins remain **Not Yet Recorded**; instructor may explicitly choose to mark missing students **Absent** during finalization. Finalized sessions cannot be reopened.
- **Cancel** a draft attendance session with a reason, retaining all check-ins but excluding it from future grade calculation; no physical deletions.
- Instructor may make an audited correction to a finalized session. Future grade-calculation changes must use an authorized revision process, not silently rewrite previously published grades.
- Export the selected class register to CSV; formula-like content is escaped.

## Actual data security and history

- Only Supabase administrators can SELECT or write the new attendance review/register tables (RLS; no direct browser write grants; server-side RPC authentication checks).
- A distinct status register stores corrections and snapshots; the existing `attendance_records` table continues to hold original Present check-ins. This avoids changing its original `status='Present'` constraint.
- Records for class sections 1A,1B,2A,2B,3A,3B come from the private official `student_roster`; subject meetings come from `class_schedules`. No manual enrollment and no student data in GitHub.
- **No historical roster backfill.** Old attendance_windows from before migration 008 have no captured original roster. Instructor may explicitly prepare one using the *current* roster, with a warning and audit trail. This cannot verify old enrollment membership; do not finalize historical records until reviewed.
- Migration 008 contains no `DELETE` or `UPDATE` of original student check-in records and has no student names or numbers.
- The calendar is a view of scheduled slots and opened sessions. Future scheduled slots do NOT automatically create persisted attendance windows or check-ins in the background.
- The legacy **Reports** page still works and is not yet rewritten to aggregate new manual statuses; use this calendar's finalized register exports for Phase 3 attendance status details. Later Phase 5 will connect only eligible finalized sessions to grades.

## Files

Added:
- `supabase/migrations/202611280008_attendance_calendar_register.sql`
- `src/lib/attendance-calendar.js`
- `src/lib/attendance-calendar-api.js`
- `src/pages/AttendanceCalendarPage.jsx`
- `src/styles/attendance-calendar.css`
- `tests/attendance-calendar-v3.test.js`
- this guide

Changed:
- `src/App.jsx` (admin attendance route)

No new packages or environment variables.

## Rollout

1. Confirm previous migrations 001–006 and official roster import. Migration 007 is not needed for this feature but can remain installed.
2. Back up the current Supabase database using a restorable method.
3. Apply 008 in **staging** and test with authenticated administrator, approved student and unauthenticated browser sessions. Confirm RLS, corrections, finalization, no duplicates and no historical check-in loss.
4. Review GitHub PR and CI. Merge into `main` only after staging validation; GitHub Pages deploys the new UI but does not execute SQL.
5. Apply 008 to production after staging success, then reload Admin → Attendance and compare dated rosters/check-ins against actual records.
6. For an old attendance window, review the absence of historical membership snapshot before clicking Prepare; otherwise existing original check-ins are still safely viewable through older reports.

## Automated and manual checks

The PR workflow runs `npm run check`, `npm test`, `npm run build` without production credentials.
These tests cover month navigation, extra sessions, status precedence, CSV escaping, SQL access contracts, and original check-in preservation. They do **not** replace a real PostgreSQL migration test, row-level access verification or live browser check.

### Known limitations

- No server-side automatic creation of attendance windows while every browser is closed; schedule slots are visible without opening a window.
- No reschedule editor, automatic lateness threshold, absence intervention dashboard or attendance-to-grade sync yet.
- Current weekly schedules can be changed without versioned historical schedule snapshots; the recorded attendance window remains but changes to the class schedule could change past calendar appearance.
- The existing daily Reports page still uses its original attendance statuses (Present/Not checked in) rather than instructor overrides; use the new selected-session CSV for updated statuses.
- Historical roster snapshots are only authoritative for windows opened after migration 008. For prior windows, explicit reconstruction is approximate.
- No new student-facing attendance correction history is published in this phase; student check-in receipts stay unchanged.

**Do not represent the entire attendance platform as production-ready until staging and live role-specific verification are complete.**
