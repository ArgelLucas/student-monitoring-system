# Student Monitoring System — Source Code

**Stack:** GitHub Pages (Vite + HTML + vanilla JavaScript + Tailwind CSS), Supabase Auth (GitHub OAuth), PostgreSQL + Row Level Security.

This repository is the initial functioning codebase. Configuration and deployment instructions can be supplied separately.

## Implemented

- GitHub OAuth sign-in, logout, PKCE flow, tab-scoped session storage
- Database-backed portal-session checks: 30-minute inactivity, 8-hour maximum, explicit revocation
- Mandatory student profile form: surname, first name, MI, sex, age, section, subject, GitHub account
- Verified GitHub identity check against protected `auth.identities` (not editable user metadata)
- Admin-approved student onboarding (pending state)
- Private student landing page and one-per-day attendance check-in (Asia/Manila date)
- Private admin dashboard, student search, approval/revocation, and attendance overview
- RLS, least-privilege grants, server-side validation and attendance deduplication
- GitHub Actions build/deploy workflow for both project and account GitHub Pages

## Repo layout

```text
student-monitoring-system/
├── .github/workflows/deploy.yml
├── src/
│   ├── lib/{api,auth,format,supabase}.js
│   ├── pages/screens.js
│   ├── styles/main.css
│   └── main.js
├── supabase/
│   ├── migrations/202611190001_initial.sql
│   └── seed.example.sql
├── tests/
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## Intentional boundaries and security notes

- **Not production-ready until deployment, RLS testing, and a privacy review have been completed.** No real Supabase instance or GitHub OAuth credentials are provided in the repository.
- The Vite `VITE_` environment variables contain only the public Supabase URL and publishable key. Never include a service-role key, secret key, or GitHub OAuth client secret in browser code.
- Do not publish student personal data, SQL dumps, access tokens, or credentials to GitHub. Keep source private until reviewed. GitHub Pages publishes generated site files publicly.
- All access checks controlling real data occur in PostgreSQL. GitHub Pages cannot prevent someone downloading a static HTML/JS page.
- Students need admin approval to check in. An initial admin is created using privileged SQL, not by self-registration.
- The sample attendance rule is **once per day per student/subject, with no configured class time window**. Attendance rules can be revised after requirements are finalized.
- The admin dashboard currently retrieves up to 500 profiles and 1,000 recent attendance rows; add paging for larger deployments.
- The front end uses sessionStorage, while the database enforces portal session checks. Static pages cannot provide HttpOnly browser auth cookies. A meta-based CSP is included, but a managed security-header hosting platform would provide stronger CSP controls. Supabase Auth controls refresh/access tokens. SQL checks `auth.sessions` to revoke protected database access after sign-out.
- The GitHub handle must match the protected Supabase GitHub identity; the SQL relies on GitHub OAuth identity data including `user_name` (or `preferred_username`/`login`). Verify actual identity fields in your Supabase project before enrolling students.
- Student information may be subject to applicable privacy laws and your school's policies. Obtain consent/authorization, define retention, and arrange backups before live use.

## Useful official references

- Supabase OAuth: https://supabase.com/docs/guides/auth/social-sign-in/auth-github
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase sessions: https://supabase.com/docs/guides/auth/sessions
- Vite static deployment: https://vite.dev/guide/static-deploy
