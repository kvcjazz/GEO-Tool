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

### AI engine secrets

Response capture queries one provider per engine. An engine is only measured
when its secret is set — if a key is missing the engine is skipped, and the GEO
score is computed from the engines that did answer:

| Engine             | Secret               |
| ------------------ | -------------------- |
| ChatGPT, Copilot   | `OPENAI_API_KEY`     |
| Google AI / Gemini | `GEMINI_API_KEY`     |
| Perplexity         | `PERPLEXITY_API_KEY` |
| Claude             | `ANTHROPIC_API_KEY`  |
| Grok               | `XAI_API_KEY`        |

Settings → *AI engines & measurement* shows which are live and names the exact
secret each missing engine needs.

Model ids are **not** pinned: each provider has a fallback chain in
`supabase/functions/_shared/providers.ts` and the first id the provider still
accepts is used, so a retired model degrades to the next one instead of
silently dropping the engine. To pin one, set `OPENAI_MODEL`, `GEMINI_MODEL`,
`PERPLEXITY_MODEL`, `ANTHROPIC_MODEL` or `XAI_MODEL`.

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
- The capture-path functions (`geo-run`, `geo-run-batch`, `geo-listen`,
  `geo-engines`) live in `supabase/functions/` and share
  `_shared/providers.ts`. Deploy with `supabase functions deploy <slug>`.
  Keep `verify_jwt` as-is: `true` for `geo-run` and `geo-engines`, `false` for
  `geo-run-batch` and `geo-listen` (the `pg_cron` jobs call them with the
  publishable key). The other functions are still dashboard-only.
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
