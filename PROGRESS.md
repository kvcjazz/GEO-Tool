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

## Parked ideas

### First-party AI platform insights panel (banked 2026-11-12)

**Idea:** a per-brand panel that records the AI platforms' *own* visibility
numbers and charts them next to each engine's GEO score, to validate the
tool's prompt-level tracking against first-party data in client reports.

**Landscape (as of Nov 2026, mostly from third-party coverage):**

| Platform | Official tool | Data available |
|---|---|---|
| ChatGPT | Business Hub (launched ~10 Nov 2026) | Mentions, website clicks, discovery topics (rolling 28 days). Also manages business profile + product feeds. **No API/export.** Mentions only count when the website is referenced; clicks ≠ visits. |
| Copilot / Bing | Bing Webmaster Tools → AI Performance (preview, Feb 2026; Intents/Topics/Citation Share/Compare added Jun 2026) | Citation counts, cited pages, grounding queries. No CTR. API coverage unconfirmed. |
| Google AI Overviews / AI Mode | Search Console → Generative AI report (beta, Jun 2026, staged rollout, UK first) | Impressions by page/country/date/device. No clicks/queries yet; AIO + AI Mode combined. Not in API as of Jun 2026. |
| Perplexity, Claude, Gemini app, Grok | None found | Third-party trackers only. |

**Proposed scope:**

1. New table (e.g. `geo_platform_insights`: brand_id, platform, period_end,
   mentions/citations/impressions, clicks, topics jsonb, notes) with RLS
   matching the other `geo_*` tables.
2. Manual monthly entry form per brand (aligned with the monthly snapshot cron).
3. Dashboard chart: first-party numbers vs. that engine's GEO score over time.
4. Business Hub "discovery topics" → suggested prompts in the Prompt Set.
5. Backlog playbook item: "Claim & verify ChatGPT Business Hub / Bing WMT /
   Search Console" and keep business details consistent.
6. Later: GA4 `utm_source=chatgpt.com` clicks via the GA4 API; replace manual
   entry with an edge function on the existing cron if/when OpenAI, Bing or
   Google expose this data via API.

Re-check each platform's current API/export status before building.
