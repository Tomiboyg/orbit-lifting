# Orbit Lifting

A calm, mobile-first workout tracker. React + Vite + TypeScript + Tailwind CSS on the
front end, Supabase as the backend, hosted on GitHub Pages. Built to be **useful
during real gym sessions**, not just visually impressive.

Educational training insights only — **not medical or individualized advice**.

---

## Stack

| Layer     | Choice                                                        |
| --------- | ------------------------------------------------------------- |
| Front end | React 19, Vite, TypeScript (strict), Tailwind CSS 3            |
| Backend   | Supabase (Postgres + RLS + Auth, PKCE flow)                    |
| Hosting   | GitHub Pages via GitHub Actions (build happens entirely in CI) |
| Tests     | Vitest (unit), Playwright (e2e, mobile viewport matrix)        |

The app is an offline-first PWA: the active workout lives in **IndexedDB on the
device**, and Supabase is the sync target — never the only copy.

---

## Quick start

1. Create a Supabase project.
2. Run the SQL in `supabase/migrations/0001_init.sql` and `0002_seed_exercises.sql`
   (SQL editor or `supabase db push`).
3. In **Auth → URL Configuration** set:
   - Site URL: your production Pages URL (e.g. `https://user.github.io/orbit-lifting/`)
   - Redirect URLs: the Pages URL, `http://localhost:5173/`, and any preview URL
4. Provide `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`):
   - Locally: copy `.env.example` to `.env.local`.
   - CI: add both as **GitHub Actions variables** (not secrets containing the
     service-role key — that key never touches this repo or the frontend).
5. Push to `main`. The workflow lints, unit-tests, type-checks, builds and deploys.
   The app is served under `/<repo-name>/` automatically (or set a custom domain and
   build with `BASE_PATH=/`).

> Repo-name tip: GitHub Pages URLs with spaces need URL encoding. A repo name
> without spaces (e.g. `orbit-lifting`) keeps every URL clean.

### Local development

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # vitest unit tests
npm run test:e2e   # playwright (needs browsers: npx playwright install)
```

---

## Deployment notes (spec 12)

- `vite.config.ts` reads `BASE_PATH`; the workflow sets it to `/<repo-name>/`.
  Asset URLs and the router basename both come from `import.meta.env.BASE_URL`.
- The build copies `index.html` to `404.html` for SPA fallback routing.
- Auth uses the **PKCE** flow so tokens never collide with routing.
- The frontend bundle contains only `VITE_SUPABASE_URL` and the anon key — both
  public by design; security comes from row level security.

### Supabase backup expectations

Supabase does not back up your data for you on the free tier. Backups are your
responsibility:

- Users can export **all** their data (CSV + JSON) from Settings → Your data.
- Recommended: enable daily backups in the Supabase dashboard (paid plans) or
  schedule `pg_dump` externally.
- The database lives entirely in `supabase/migrations` — the schema is reproducible
  from this repo at any time.

---

## Database security (spec 12.4)

- RLS is enabled on **every** table (`profiles`, `exercises`, `routines`,
  `workouts`, `workout_exercises`, `sets`, `user_settings`, `recommendations`).
- Policies use `user_id = (select auth.uid())` with both `USING` and `WITH CHECK`.
- Global exercise rows (`user_id is null`) are readable by all authenticated users
  and writable by no one. Custom exercises are user-owned.
- Views use `security_invoker = true`.

### Policy test checklist (manual, run per release)

Sign in as user A and user B in two browsers:

1. A cannot `SELECT` B's workouts / sets / settings / recommendations
   (`select * from sets where user_id = 'B'` → 0 rows).
2. A cannot `UPDATE` or `DELETE` B's rows by id (RLS filters them out).
3. A cannot `INSERT` a row with `user_id = B` (WITH CHECK rejects it).
4. A **can** read global exercises, but `UPDATE`/`DELETE` on them fails.
5. A can create, read, update and delete their own custom exercises.
6. The `weekly_set_volume` view returns only A's data when A queries it.

---

## Active workout persistence (spec 11.5)

The source of truth for an active workout is **IndexedDB** (single atomic
transaction per write, debounced ≤250 ms for typing). It is flushed immediately on
`visibilitychange(hidden)` and `pagehide`; `beforeunload` is never relied upon.
Restore recomputes timers from absolute timestamps. Sync uses an outbox with
idempotent upserts keyed by **client-generated UUIDs**; the local copy is deleted
only after the server confirms the finished workout.

**Known platform limits**

- Browsers can clear site data under storage pressure, and Safari clears data for
  websites not used for ~7 days when not installed as a PWA. **Install the app to
  the home screen** and allow storage persistence (requested on first workout;
  status shown in Settings) to minimize this.
- Because of that limit, the outbox syncs sets to Supabase as soon as a connection
  is available — not only when the workout finishes — so a server copy exists for
  any workout that was online at some point.

**Acceptance tests**

| # | Scenario                                                             | Where                        |
| - | -------------------------------------------------------------------- | ---------------------------- |
| 1 | Log 3 sets, type an unconfirmed weight, reload → all restored         | Manual / Playwright          |
| 2 | Rest timer survives tab close; shows finished if it ended while away  | Timestamp-based by design    |
| 3 | Offline logging → intact after reopen; syncs once online, no dupes    | Outbox upserts keyed by UUID |
| 4 | Expired auth session → workout still opens; sign in → sync completes  | Restore is network-independent |
| 5 | Kill app from iOS app switcher → restored on reopen                   | Manual on a real iPhone      |
| 6 | Failed finish request → workout stays local and queued                | "Not synced yet" banner      |

---

## Project layout

```
src/
  components/    UI kit, icons (original set), charts, navigation
  features/
    recommendations/  metrics + deterministic rules engine (no ML/LLM)
  hooks/         auth, rest timer (timestamp-based), wake lock, insights
  lib/           supabase client, IndexedDB wrapper, outbox sync, analytics, export
  pages/         Dashboard, Logger, History, Insights, Exercises, Settings, Auth
  store/         zustand stores (workout, settings, theme)
supabase/migrations/  schema, indexes, RLS policies, seed data
tests/e2e/      Playwright suite
```

## Design system (spec 14)

Design tokens live in `src/styles/tokens.css`: five colourways (Graphite, Ocean,
Aurora, Ember, Sakura), light/dark glass surfaces, radii, and a "reduce
transparency" mode that also honours `prefers-reduced-transparency` and
`prefers-reduced-motion`. The workout logger intentionally uses nearly opaque,
high-contrast surfaces — usability beats style between sets.
