# Orbit Lifting — Setup Tutorial

Step-by-step guide from zero to a working app on GitHub Pages with Supabase.
No local Node.js required — everything is built in GitHub Actions.

---

## Part 1 — Supabase (backend)

### 1.1 Create the project
1. Go to **https://supabase.com** → sign in (GitHub login works).
2. Click **New project**.
3. Fill in:
   - **Name:** `orbit-lifting` (or anything)
   - **Database Password:** generate one and **save it** somewhere safe
   - **Region:** pick the one closest to you
4. Click **Create new project** and wait ~2 minutes for provisioning.

### 1.2 Run the database migrations
1. In the left sidebar click **SQL Editor** → **New query**.
2. Open the file `supabase/migrations/0001_init.sql` from this repo,
   copy **everything**, paste it into the editor, click **Run**.
3. Open a new query, repeat with `supabase/migrations/0002_seed_exercises.sql`.
4. Verify: **Table Editor** should now show 8 tables
   (`profiles, exercises, routines, workouts, workout_exercises, sets, user_settings, recommendations`)
   and the `exercises` table should have **29 rows** (the seed library).

### 1.3 Get your API keys
1. Left sidebar → **Project Settings** (gear) → **API**.
2. Copy two values (you'll need them in Part 2):
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** API key — a long JWT-looking string under "Project API keys"

> ⚠️ Only ever use the **anon / publishable** key. Never the `service_role`
> key — that one bypasses all security and must not go into the app or repo.

### 1.4 Configure authentication URLs (do after Part 3, once you know your URL)
1. Left sidebar → **Authentication** → **URL Configuration**.
2. **Site URL:** `https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/`
3. **Redirect URLs** — add all of these:
   - `https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/**`
   - `http://localhost:5173/**`

---

## Part 2 — GitHub repository + variables

### 2.1 Create the repo
1. Go to **https://github.com/new**.
2. **Repository name:** pick one **without spaces**, e.g. `orbit-lifting`
   (the name becomes part of the URL, so `maros tracker` would create ugly
   encoded URLs — keep it lowercase-with-hyphens).
3. Set to **Private** or **Public** (either works).
4. Do **not** initialise with a README (we push our own files).
5. Click **Create repository**.

### 2.2 Add the Supabase variables
1. In the repo: **Settings** → **Secrets and variables** → **Actions**.
2. Open the **Variables** tab (NOT "Secrets" — the anon key is public by design).
3. Click **New repository variable** and add:
   - Name: `VITE_SUPABASE_URL` · Value: your Project URL from 1.3
4. Add a second one:
   - Name: `VITE_SUPABASE_ANON_KEY` · Value: your anon key from 1.3

Names are case-sensitive — copy them exactly.

### 2.3 Enable GitHub Pages via Actions
1. Repo **Settings** → **Pages** (left sidebar, under "Code and automation").
2. Under **Build and deployment** → **Source**, select **GitHub Actions**.
   (That's it — our workflow does the rest.)

---

## Part 3 — Push the code

Open PowerShell in this folder (`D:\a.Majner_produce\maros tracker`) and run:

```powershell
git init
git add .
git commit -m "Initial commit: Orbit Lifting"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
git push -u origin main
```

When prompted for credentials, sign in through the GitHub browser window
(Git Credential Manager handles this automatically on Windows).

---

## Part 4 — Watch the build

1. Go to your repo → **Actions** tab.
2. You'll see **"Deploy to GitHub Pages"** running. It does, in order:
   1. `npm ci` — install dependencies
   2. **Lint**
   3. **Unit tests** (the recommendation-engine suite)
   4. **Type check + build** (with `BASE_PATH=/<repo-name>/`)
   5. Playwright smoke test (allowed to fail without blocking)
   6. **Deploy** to GitHub Pages
3. First run takes ~3–5 minutes. When it shows a green ✓, your app is live at:

   **`https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/`**

4. Now go back and finish **step 1.4** (Supabase auth URLs) using that address.

---

## Part 5 — First use

1. Open the app URL on your phone (or desktop browser).
2. Tap **Register**, enter a display name, email and password.
3. Supabase sends a confirmation email — click the link in it, then sign in.
4. You should land on the Dashboard with the seeded exercise library
   (check **Exercises** in the sidebar — 29 exercises).

> Testing tip: to skip the email step while trying things out, go to
> Supabase → **Authentication** → **Providers** → **Email** → turn off
> **Confirm email**. Turn it back on for real use.

### Install as a phone app (recommended)
The app is a PWA. Installing it also protects your workout data from the
browser's storage cleanup:

- **iPhone (Safari):** Share button → **Add to Home Screen**.
- **Android (Chrome):** menu ⋮ → **Install app** / "Add to Home screen".

Then open Settings in the app and request **storage persistence** if it
shows as "not granted".

---

## Part 6 — Troubleshooting

| Symptom | Cause & fix |
| --- | --- |
| App shows **"Setup required"** | Env vars missing/misnamed. Check Part 2.2 (exact names, Variables tab). Then re-run: Actions → Deploy workflow → **Run workflow**. |
| **404** on refresh of a deep link | Pages Source isn't "GitHub Actions", or the deploy didn't run. Re-check Part 2.3. |
| Register works but **email link errors** | Redirect URLs missing in Supabase (Part 1.4) — must include your Pages URL with `/**`. |
| **"Failed to fetch" / nothing loads** | Check `VITE_SUPABASE_URL` has no trailing slash and no `/rest/v1` suffix. |
| Build fails at **Lint / Type check** | Open the Actions log, copy the error lines, and fix — CI is strict on purpose. |
| Data doesn't sync | Sign-in expired. Open the app, sign in again; the outbox syncs automatically when a session exists. |
| Row-level-security errors in Supabase logs | You tried writing with the wrong key or without being signed in — the app never sends the service-role key. |

### Deleting your data
Settings → **Your data** → **Delete account data** removes every row you own
from Supabase. Export a backup first (CSV + JSON) — Supabase doesn't back up
the free tier for you.
