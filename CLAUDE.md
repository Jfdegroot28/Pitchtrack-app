# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## Project Overview

**PitchTrack Pro** is a single-page web app for tracking baseball pitching
outings and analyzing pitcher performance. It is branded for **SUNY Poly**
(navy/gold color scheme). A user charts every pitch of an outing in real time
(pitch type, velocity, zone location, result, batted-ball data, base runners),
and the app computes season/outing statistics and renders analytics
(heat maps, hard-hit zones, L/R splits, count breakdowns, sequencing, spray
charts, arsenal usage, outing history).

Data is persisted to **Supabase** (Postgres + Auth + Realtime). The app is
deployed as a static SPA on **Vercel**.

## Tech Stack

- **React 18** (function components + hooks only — no class components)
- **Vite 5** for dev server and build (`@vitejs/plugin-react`)
- **Supabase JS v2** (`@supabase/supabase-js`) for auth, database, realtime
- Plain JavaScript / JSX (no TypeScript, despite `@types/*` devDeps)
- **No CSS framework** — all styling is inline `style={{...}}` objects using a
  shared palette of color constants. A small amount of global CSS is injected
  at runtime.
- **No test framework, no linter/formatter** configured.

## Repository Layout

```
.
├── index.html          # Vite entry HTML (mobile-optimized meta tags, "PitchTrack Pro" title)
├── package.json        # deps + scripts (dev/build/preview)
├── vite.config.js      # minimal Vite + React config
├── vercel.json         # SPA rewrite: all routes -> "/"
├── gitignore           # NOTE: literally named "gitignore" (no leading dot)
├── public/
│   └── favicon.svg
└── src/
    ├── main.jsx        # React root, mounts <App /> in StrictMode
    ├── supabase.js     # Supabase client singleton (reads VITE_ env vars)
    └── App.jsx         # ENTIRE application (~1100 lines, ~125 KB) — see below
```

### `src/App.jsx` is the whole app

Almost all logic lives in this one file. It is intentionally written in a very
dense, abbreviated style (terse names, packed one-liners) to keep the file
manageable. When editing, **match the surrounding style** — short names, inline
styles, compact expressions. Do not reformat or "clean up" existing code unless
asked; it will create huge, noisy diffs.

Rough structure of `App.jsx` (line numbers approximate — re-grep before
relying on them):

- **Top-level constants** (lines ~4–46): pitch types/colors/labels, strike-zone
  geometry (`W,H,ZL,ZR,ZT,ZB`...), result/hit-type tables (`RESULTS`, `HT`,
  `HS`, `HR_`, `COUNTS`, `ANA_VIEWS`), and the SUNY Poly color palette
  (`G`=gold, `N`=navy, `BG*`, `BD*`, `TX*`, `SC`/`sc()` for stat coloring).
- **Pure helpers**: `getZone`, `getComp`, `uid`, `today`, `fmtAvg`, `advCnt`
  (advance ball/strike count), `isTerm` (at-bat terminal?), `mkAB` (make
  at-bat), `autoUpdateRunners`, `generateReportHTML`.
- **`computeStats(...)`** (~line 90): the core analytics engine — turns raw
  pitch/at-bat/run arrays into a season/outing stat object (ERA, WHIP, K/BB,
  FPS%, hard-hit%, SB/CS, etc.).
- **Sub-components**: `ZoneView`, `DensityZone`, `HardHitZoneMap`,
  `SprayChart`, `BaseRunnerDiamond`, `BatterIcon` — all SVG-based visualizations.
- **`export default function App()`** (~line 264): the root component holding
  all state and rendering the three tabs.

### The three tabs (`tab` state: `'chart' | 'analytics' | 'team'`)

- **`chart`** — live pitch-charting UI: select pitcher/date/opponent, plot
  pitches on the zone, record result + batted-ball outcome, manage count,
  innings, and base runners.
- **`analytics`** — per-pitcher / per-outing analysis. The `ana` state object
  drives filters (`view`, `filterType`, `hitsOnly`, `handFilter`, `heatMode`,
  `sprayFilter`, `hardZoneMode`, `outingId`). Views are listed in `ANA_VIEWS`.
- **`team`** — sortable team-wide leaderboard; clicking a row jumps to that
  pitcher's analytics.

## Data Model (Supabase)

Two tables are used (queried directly from the client):

- **`pitchers`** — columns include `name` (also used as the identifier).
- **`outings`** — columns: `id`, `pitcher`, `date`, `opponent`, `inning`,
  `pitches` (jsonb), `at_bats` (jsonb), `base_events` (jsonb),
  `inning_runs` (jsonb), `earned_runs` (jsonb), `completed` (bool),
  `created_at`, `updated_at`.

Note the **snake_case DB columns vs camelCase app state** mapping done in the
`outings` fetch (`at_bats`→`atBats`, `base_events`→`baseEvents`,
`earned_runs`→`earnedRunsByInning`, etc.). Preserve this mapping on both read
and write paths.

### Persistence behavior

- Active outings are **autosaved** via a debounced (~400 ms) `upsert` while
  charting; finishing an outing upserts with `completed: true`.
- A Supabase **Realtime channel** (`pitchtrack-live`) keeps data in sync across
  clients.
- Writes are guarded by `if(session)` — only authenticated users persist.

### Auth

Email/password via `supabase.auth` (`signInWithPassword`, `signUp`,
`onAuthStateChange`, `signOut`). The app gates the UI behind a sign-in screen.
Pitcher display order is persisted client-side in `localStorage`
(`pt_pitcher_order`).

## Environment Variables

Set these in `.env` (gitignored) for local dev and in the Vercel project
settings for deploys. They are read by `src/supabase.js`:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Vite only exposes vars prefixed with `VITE_` to client code.

## Development Workflow

```bash
npm install        # install deps
npm run dev        # start Vite dev server (hot reload)
npm run build      # production build -> dist/
npm run preview    # serve the production build locally
```

There are **no tests, no lint, and no typecheck** steps. "Verifying" a change
means running `npm run build` (catches syntax/import errors) and exercising the
app in the browser via `npm run dev`.

## Conventions & Gotchas

- **One-file architecture**: prefer adding to `App.jsx` in the existing style
  rather than introducing new files/abstractions, unless a change is large
  enough to clearly warrant a new module.
- **Inline styles only**: use the existing color constants (`G`, `N`, `BG_*`,
  `BD_*`, `TX_*`, `SC`) instead of hardcoding hex values, to stay on-brand.
- **Terse code is intentional** — do not refactor for readability uninvited.
- **State shapes are load-bearing**: pitch objects (`INIT_P`), at-bats
  (`mkAB`), runners (`INIT_RUNNERS`) have specific shapes consumed by
  `computeStats` and the visualizations. Keep them in sync if you change them.
- **DB column mapping**: snake_case (DB) ↔ camelCase (state) — update both
  read and write when adding fields.
- The repo's git ignore file is named `gitignore` (no leading dot), so it is
  **not actually active**. `node_modules`, `dist`, and `.env` are nonetheless
  the things you should never commit.

## Git & Deployment

- Default branch: `main`. Deploys go through **Vercel** (static build of
  `dist/`, SPA fallback via `vercel.json`).
- Commit with clear, descriptive messages. Do **not** open a pull request
  unless explicitly asked.
- Never commit secrets or a `.env` file.
