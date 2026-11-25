# StudentMonitor v5 — React + GSAP

StudentMonitor is a responsive, animated student attendance and class-management portal built with **React 19, Vite, CSS, GSAP, Supabase Auth/PostgreSQL, and GitHub Pages**.

This is an **original UI implementation**, inspired by modern animated dashboards. No commercial template source code is included.

## What is implemented

- GitHub OAuth login through Supabase Auth; logout and existing portal-session revocation
- Mandatory student profile (surname, first name, MI, sex, age, section, subject, matching GitHub username)
- Pending administrator approval gate; approved students view their class timetable and attendance
- Student check-in through the existing protected `mark_my_attendance` RPC
- Admin dashboard with live database totals, class-window tiles, activity timeline and animated attendance chart
- Admin student search/filter, approval/revocation, detail drawer and controlled assignment correction
- Class attendance open/close controls (server-side schedule validation remains active)
- Attendance monitor; date/section/subject reports with CSV export
- React Router hash navigation with no full-screen session verification on each tab
- GSAP page entrance, number counters, graph reveal, modal/drawer motion; mobile navigation, light/dark theme, reduced-motion preferences

**Security boundary:** React route guards are for user experience. Actual student/admin permissions, profile-completion requirements, and attendance rules MUST be enforced by the included Supabase SQL/RLS/RPC migrations. Never embed a Supabase secret/service-role key in browser code.

## Folder layout

```text
student-monitoring-system-react-gsap/
├── .github/workflows/deploy.yml
├── src/
│   ├── components/UI.jsx              # GSAP animations, cards, modal/drawer
│   ├── pages/AdminPages.jsx           # Overview, students, classes, reports, audit
│   ├── pages/StudentPages.jsx         # Login, profile, pending, timetable, check-in
│   ├── pages/legacy-trend.js          # Existing server-data-based chart calculations
│   ├── state/SessionProvider.jsx      # Background session and data validation
│   ├── lib/                            # Reused v4.1 Supabase API/auth/report logic
│   ├── styles/app.css                 # Responsive original dashboard styles
│   ├── App.jsx                        # Protected routes
│   └── main.jsx                       # React entry point
├── supabase/migrations/               # The ORIGINAL 001, 002, 003 SQL migrations
├── scripts/check-source.mjs
├── tests/react-app.test.js
├── .env.example
├── index.html
├── package.json
└── vite.config.js
```

## Run in VS Code

1. Back up your previous `SMS` project folder, especially `.env` and `.git`. Extract this ZIP into its own folder. You can then merge files into your existing Git repository **after backing up**.
2. Install **Node.js 22 LTS** (or current supported Node LTS) and open the extracted folder in VS Code.
3. Run `npm install` in the folder that contains `package.json`. This project intentionally does not contain `node_modules` or an out-of-date `package-lock.json`; `npm install` generates a fresh lockfile.
4. Copy `.env.example` to `.env` and set your **existing** Supabase Project URL and **publishable** API key:

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
   ```

   Do not share or commit secret keys. Ensure an earlier exposed secret key has been revoked or rotated.
5. Run `npm run check`, `npm test`, `npm run build`, then `npm run dev`.
6. Open `http://127.0.0.1:5173/` and log in using GitHub.

**No new Supabase migration is required just for React/GSAP.** Your existing Supabase database must have migrations `202611190001_initial.sql`, `202611190002_schedule_attendance.sql`, and `202611250003_admin_reporting.sql` successfully applied. If you have not applied one, back up your database and apply the missing migrations **in order**. Do not rerun a completed migration without checking first.

The following existing RPCs are used unchanged: `touch_portal_session`, `end_portal_session`, `is_admin`, `list_section_subjects`, `current_github_username`, `save_student_profile`, `set_student_approval`, `admin_update_student_assignment`, `open_class_attendance`, `close_class_attendance`, `mark_my_attendance`.

**If the UI shows `column audit_logs.details does not exist`:** migration 003 is missing/incomplete. **If the UI shows `Could not find ... list_section_subjects`:** migration 002 is missing/incomplete. Do not weaken RLS or introduce public service keys to bypass those errors.

## Publish using GitHub Pages

- Preserve your existing GitHub OAuth app and Supabase Auth redirect URL configuration.
- In the repository: **Settings → Secrets and variables → Actions → Variables**, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the same **public** values used locally.
- **Settings → Pages → Source: GitHub Actions**.
- Commit and push these files to `main`. The included workflow builds the React app with the correct GitHub Pages base path.
- GitHub Pages URLs remain `https://USERNAME.github.io/REPOSITORY/#/admin`, `#/student`, and so on. `HashRouter` is used to prevent 404 errors on page reload.
- Keep Supabase **Authentication → URL Configuration** redirects correct for both localhost and your GitHub Pages base URL. The OAuth callback registered on GitHub should point to Supabase's `/auth/v1/callback`, not to the GitHub Pages frontend.

## Important validation before students use it

This environment could run the **11 unit/static tests** and parse the JavaScript/JSX, but could **not download npm packages**, so the production Vite build and live Supabase integration are **not verified** here.

On your own system, test: admin vs. student access, profile gate, GitHub ownership matching, assignment validation, approval revocation, class time windows in Asia/Manila, duplicate check-in prevention, logout / idle timeout, reports and CSV, mobile navigation and light/dark theme. The live database RLS functions, not React, determine whether students can access records or check in.

This frontend uses the existing `fetchPaged()` implementation with a ceiling of 10,000 rows per table. For larger schools, add dedicated paginated/aggregated server endpoints.
