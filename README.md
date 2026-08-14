# Luminous GEO — AI Visibility Tracker

Production **Next.js** rebuild of the Luminous GEO pilot: a tool that audits a
brand's visibility across the major AI answer engines (ChatGPT, Google AI /
Gemini, Perplexity, Copilot, Claude, Grok), computes a blended **Luminous GEO
Score**, and turns the findings into a prioritised PR & content strategy.

This app is a faithful port of the single-file prototype
(`geo-pilot-app-source.html`) to the Next.js App Router, wired to the **existing**
Luminous GEO Supabase backend (database, RLS, Auth, Edge Functions and cron are
reused, not recreated).

## Stack

- **Next.js 16** (App Router, TypeScript strict, React 19)
- **Tailwind CSS v4** + the ported prototype design system (`src/app/globals.css`)
- **@supabase/supabase-js** + **@supabase/ssr** (cookie-based auth)
- **Zod** — parses every edge-function response (`src/lib/schemas.ts`)
- **Chart.js** + **react-chartjs-2** — dashboard charts

## Getting started

```bash
npm install
cp .env.example .env.local     # already contains the public Supabase values
npm run dev                    # http://localhost:3000
```

Sign in with the Supabase email/password pilot account. Append `?view=client`
to force the read-only **Client view**.

### Environment variables

Only the two public Supabase values are required (see `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

All AI provider keys stay server-side as **Supabase Edge Function secrets** — the
Next.js app never needs them, it only calls the functions.

## Architecture

- **Auth & routing** — `src/proxy.ts` refreshes the Supabase session cookie and
  guards every route; unauthenticated users are redirected to `/login`.
- **State** — `src/state/AppState.tsx` mirrors the prototype's `STATE`: it loads
  the brand list and, per selected brand, all `geo_*` data in parallel, and
  exposes actions (`selectBrand`, `reload`, `buildFeasibilityMemory`, …). Team ⇄
  Client mode and the current view are held here.
- **Scoring** — `src/lib/scoring.ts` reproduces the prototype's scoring model
  **exactly** (`engineMetrics` → `geoSub` → `computeAll`), driven by each brand's
  editable metric- and engine-weights.
- **Edge functions** — `src/lib/callFn.ts` attaches the signed-in user's token +
  the anon key and validates the JSON response with a Zod schema.
- **Views** — `src/views/*` — one component per sidebar page (Dashboard,
  Response Capture, Prompt Set, Opportunity Backlog, PR Planning, Source Intel,
  PR & Influence, Listening, Settings).

## Backend (reused, do not recreate)

- Supabase project `ymnulfluxjgqacodzfxq`.
- Tables are `geo_*`-prefixed with RLS (`FOR ALL TO authenticated`).
- Edge functions: `geo-run`, `geo-run-batch`, `geo-radar`, `geo-news`,
  `geo-listen`, `geo-engines`, `geo-advise`.
- Two `pg_cron` jobs run monthly snapshots + listening scans server-side.

The retired hosting hack (`geo_app` table + `geo-pilot`/`geo-publish`/`geo-diag`
functions) is intentionally **not** used.

## Deploy (Vercel)

Create a **new** Vercel project (suggested name `luminous-geo`), framework
auto-detected as Next.js, add the two `NEXT_PUBLIC_*` env vars, and deploy. Do
**not** deploy into the unrelated `luminous-pr-tracker` project.

## Scripts

```bash
npm run dev      # dev server
npm run build    # production build (+ typecheck + lint)
npm run start    # serve the production build
npm run lint     # eslint
```
