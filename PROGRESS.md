# PROGRESS

Running log of the Luminous GEO production rebuild so future sessions know where
things stand.

## 2026-08-14 — Next.js rebuild (parity port)

Rebuilt the single-file prototype (`geo-pilot-app-source.html`) as a production
Next.js app on this branch. Backend (Supabase project `ymnulfluxjgqacodzfxq`) is
reused untouched.

### Done — full feature parity

- **Scaffold**: Next.js 16 (App Router, TS strict, Tailwind v4), deps: supabase-js,
  @supabase/ssr, zod, chart.js, react-chartjs-2.
- **Design system**: prototype CSS ported verbatim into `globals.css` (same class
  names / tokens → pixel parity).
- **Auth**: cookie-based `@supabase/ssr`; `src/proxy.ts` guards routes; `/login`
  page; sign-out.
- **State**: `src/state/AppState.tsx` — brand list + per-brand parallel loads,
  Team/Client mode, view switching, feasibility memory, toast.
- **Scoring**: `src/lib/scoring.ts` reproduces the model exactly (verified against
  the prototype's `computeAll`). Default weights unchanged.
- **Edge functions**: `src/lib/callFn.ts` + Zod schemas in `src/lib/schemas.ts`
  for geo-run, geo-run-batch, geo-radar, geo-news, geo-listen, geo-engines,
  geo-advise.
- **All 9 views** ported: Dashboard (3 charts + confidence + PR attribution),
  Response Capture (live edit, evidence, ⚡ Auto-run, 📸 New snapshot), Prompt Set,
  Opportunity Backlog (playbooks + ✨ tailor), PR Planning / Radar (news panels,
  feasibility memory, rate/save/dismiss/backlog), Source Intel, PR & Influence
  (auto citation matching), Listening (scan), Settings (strategy, PR profile,
  media list, weights editors, competitors/prompts CRUD, ✨ suggest prompts,
  context + file upload via pdf.js/mammoth, engines status, data tools, danger
  zone).

### Verified

- `npm run build` green (typecheck + lint pass).
- Runtime smoke: `/` → 307 redirect to `/login`; `/login` renders.
- Live Supabase project + schema confirmed via Supabase MCP; DB types generated
  into `src/lib/database.types.ts`.

### Not done / next steps

- **Deploy to Vercel** — create a NEW project `luminous-geo`, set the two
  `NEXT_PUBLIC_*` env vars. Do not touch `luminous-pr-tracker`.
- End-to-end auth + data smoke against the live pilot (couldn't sign in from the
  build container; browser path is unaffected).
- Optional roadmap (from the handoff): real per-client accounts + roles, branded
  PDF/report exports, moving AI logic into Next.js route handlers, adding the
  remaining engine API keys in Supabase.
