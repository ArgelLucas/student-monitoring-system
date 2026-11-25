# Upgrade v3 → v4 (dashboard redesign)

1. Back up VS Code files and Supabase.
2. Extract v4 and replace the old project source files (keep your local `.env` and `.git`).
3. Run `npm install`, `npm run check`, `npm test`, and `npm run build`.
4. Run `npm run dev` and test your GitHub admin login.
5. If your database previously displayed `column audit_logs.details does not exist`, execute existing `supabase/migrations/202611250003_admin_reporting.sql` in the Supabase SQL Editor **once**, provided migrations 001 and 002 are already installed. Do not run 001 again against an existing database.
6. Check Overview, Students, Attendance, Classes, Reports, Activity Log, and logout with a real administrator account. Then test student restrictions with a separate GitHub account.
7. Commit changes and push `main`; GitHub Actions deploys if `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` repository variables are configured.

There is **no new v4 SQL migration**. The dashboard's figures are based on live Supabase records; if a class window has never been opened, some analytics areas deliberately display empty states.
