# Upgrading an existing StudentMonitor v4.1 project

1. Back up your current `SMS` folder, Supabase records, `.env` file and `.git` repository. Do not delete the database or user accounts.
2. Extract the `StudentMonitor-v5-React-GSAP.zip` file. **Do not keep your old `src/main.js` or old HTML screen templates**; this is a React conversion with `src/main.jsx` and `src/App.jsx`.
3. Copy the v5 project files into your existing Git-connected folder, replacing prior `src/`, `index.html`, `package.json`, and `vite.config.js`. Preserve your old `.env` and `.git`. Keep the new `supabase/migrations/` directory unchanged for reference.
4. Open the VS Code terminal in the folder containing `package.json` and run:

   ```sh
   npm install
   npm run check
   npm test
   npm run build
   npm run dev
   ```

5. Visit `http://127.0.0.1:5173/#/admin` and sign in with your existing authorized GitHub admin account. Your student login, DB records, approvals, timetables and attendance stay in Supabase.
6. Verify all actions locally before pushing to GitHub. After validation, run:

   ```sh
   git add .
   git commit -m "Rebuild StudentMonitor with React and GSAP"
   git push origin main
   ```

No new SQL is required for v5 itself. Migrations 001, 002, and 003 **must** already be applied for every feature to work. Correct Supabase function errors by applying the proper missing migration, not by granting public privileges.

**Do not paste a Supabase secret/service-role key into `.env` or GitHub Actions variables.** Use only the `sb_publishable_...` key. If an older secret was revealed in a screenshot, rotate or revoke it.
