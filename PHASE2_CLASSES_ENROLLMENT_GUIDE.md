# Phase 2 — Classes, Semesters and Enrollments

**Status: proposed code in review branch. Not deployed. No live student or grade data modified.**

## What's implemented

- Academic years with validated calendar start/end dates.
- First/second semesters, checked against academic-year dates and existing term overlap.
- Class offerings per academic term + section + subject, tied to a verified administrator instructor.
- A snapshot of the published weekly timetable for each offering.
- A non-destructive class enrollment record per official student number, including immutable at-enrollment names, section, and enrollment date.
- Enroll multiple roster students in a selected offering (up to 200 per transaction), with duplicate avoidance and section validation.
- Change enrollment statuses to enrolled / dropped / completed with a mandatory reason and audit event.
- Archive offerings while retaining past enrollment and meeting data.
- Admin-only academic workspace at `#/admin/academic-classes`, responsive and consistent with current navigation.
- Pagination for up to 10,000 academic records per entity; explicit error above that limit.

## Files

**Created**
- `supabase/migrations/202611280007_academic_classes_enrollments.sql`
- `src/lib/academic-classes.js`
- `src/lib/academic-classes-format.js`
- `src/pages/AcademicClassesPage.jsx`
- `src/styles/academic-classes.css`
- `tests/academic-classes.test.js`
- This guide.

**Modified**
- `src/App.jsx`
- `src/pages/AdminPages.jsx`

**Dependencies**: no new npm packages. Existing Supabase client/React used.

**Environment variables**: no new variables.

## Important security and data cautions

- No student numbers, names, grading workbook data, scores, or private SQL import in GitHub.
- All five academic tables use Row Level Security with admin-only SELECT and revoked direct browser writes. Mutations are authorized in Supabase SECURITY DEFINER RPCs.
- Student number and section must match the active official roster; students cannot enroll themselves.
- Historical snapshots survive changes to the student's current section/name.
- No automatic enrollment migration/backfill is run. Existing approved GitHub accounts and student profiles remain unchanged.
- Existing attendance, gradebook, dashboard and reports still read their legacy tables until future phases introduce verified class-offering links.
- Do not treat the new enrollment UI as an automatic historical attendance or grade correction.

## Deployment order (after code review and validation)

1. Review Phase 1 PR and resolve the duplicate `006` migration safely. Verify the **actual live** `attendance_windows` columns and function definitions before running the corrected migration.
2. Confirm migrations `001–006` are installed, including the official private roster needed by migration `004`. Do not blindly rerun old SQL.
3. Create a restorable backup of the real Supabase project.
4. Review migration `007` in the SQL Editor, then apply it in a **staging project first**. Validate table constraints, RPC behavior with admin/student/anon sessions, and RLS. Apply to production only after staging succeeds.
5. Review the GitHub PR and validate CI. Merge Phase 1 first, then Phase 2. GitHub Pages only deploys the React code; it does **not** apply SQL.
6. In the live site, open Admin → Class enrollments. If migration 007 is not installed, a setup notice appears instead of a form.
7. Create an academic year and semester with institution-approved calendar dates.
8. Create offerings for the sections and subjects actually being taught (e.g. 2A — CT 223a and 2A — QCA 113 are different offerings).
9. Review official student roster and enrollment dates, select eligible students, and explicitly enroll them in each offering.
10. Confirm the same official student number appears in multiple classes without creating duplicate profiles. Verify changing enrollment status preserves its row and audit trail.

## Tests and limitations

CI runs `npm run check`, `npm test`, `npm run build` using non-production placeholder Supabase configuration.
This validates code and static contracts, **not** the live DB migration.
No PostgreSQL container was available in the coding environment to execute the migration.
A staging Supabase test remains mandatory before release.

## Next phase

Phase 3 will introduce dated class meetings, attendance calendar sessions, historical enrollment snapshots, corrections, late/excused/absent statuses and audited finalization. The Phase 2 schema intentionally does not change the existing attendance authorization functions or current report results.
