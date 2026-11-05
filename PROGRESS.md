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

## 2026-10-21 — Measurement v2, steps 1–2

- New `geo-measure` edge function (source in `supabase/functions/`): unprimed
  question, provider web search on (OpenAI/xAI Responses `web_search`, Gemini
  `google_search`, Claude `web_search` server tool; Perplexity always searches),
  real citation URLs only, and code-based mention / competitor / own-site-cited /
  evidence checks. Prominence, sentiment, accuracy: same engine, separate call.
- DB (applied): `aliases` on `geo_brands` + `geo_competitors`; `answer`,
  `web_search`, `method`, `model`, `raw` on `geo_responses`.
- App: "Also known as" fields in Settings; Response Capture shows the full answer
  and v2 web-search status; Auto-run goes through `MEASURE_FN` (still `geo-run`).
- Not done: deploying `geo-measure`, a v1-vs-v2 comparison on live prompts,
  moving `geo-run-batch` + cron to v2, re-baseline. Step 3 (independent judge +
  client fact sheet) is next after that.

### 2026-10-21 — v1 vs v2 test (Luminous PR, 28 prompts, 1 sample, ChatGPT + Claude)

- `geo-measure` deployed (verify_jwt on). Test called it via pg_net; nothing
  written to client data.
- Unbranded prompts: v2 mentions Luminous PR in 0/18 (ChatGPT) and 1/16 (Claude)
  answers; v1's October run had ChatGPT "Recommended" it on all 4 unbranded
  prompts it measured — the brand-priming effect.
- Branded prompts: mentioned 10/10 (ChatGPT) and 9/9 (Claude), luminouspr.com
  cited in most.
- Competitor mentions 0 in v2: answers write "Tyto"/"Ballou" without "PR", so
  competitor aliases are needed.
- Gemini (quota exceeded) and Perplexity (out of credits) fail with billing
  errors — also affects v1 monthly snapshots.
- Open issues before switch-over: 3/28 Claude calls exceeded 150 s (search is
  slow — cap searches or use the basic tool); check whether Claude's source list
  falls back to every page read rather than only cited pages.

## 2026-10-26 — Measurement v2 live; new navigation

- Merged v2 measurement (queued snapshots, web search). Luminous PR re-baselined:
  GEO 56.6; named in 100% of answers to branded questions, 0% to unbranded.
- New navigation built from the approved mock-up: areas by monthly cycle,
  context bar, page headers with "what to do here", tabbed AI answers and Plan,
  Client setup checklist + Admin split out of Settings, Prompt Set tab removed,
  Overview headline "Found by new buyers" vs "Recognised by name", Answers
  grouped by question with "Review / override" for edits, Sources "Add to
  plan", accepted ideas go straight into the one action plan.

## 2026-10-29 — Titles to target

- New **Plan → Titles to target** tab (`src/views/TargetsView.tsx`): which
  cited sites to target, judged by a senior-PR review (`geo-targets`, deployed)
  against the client's story. Team can add titles (to the media list), mark a
  relationship or a no-go; realistic titles feed the Radar.
- `geo_target_titles` table + RLS (per-client, same as other `geo_` tables) —
  applied to the live project.
- Settings: brand saves now say "Not saved" when the database refuses the
  update (no edit access) instead of reporting success.
- Not yet verified end-to-end in a signed-in browser (the build container can't
  reach the Supabase URL).

## 2026-11-05 — Fix "delete client"

- Deleting a client failed with an FK violation on `geo_media_targets`
  (also latent on `geo_radar_items`, `geo_news`). Those FKs now cascade and
  `geo_delete_brand` clears every brand-linked table. Applied live via
  migration `geo_delete_brand_fix_fk_cascade`; SQL kept in
  `supabase/migrations/20261105120000_geo_delete_brand_fix_fk_cascade.sql`.

## 2026-11-05 — Expert question suggestions (geo-advise v10)

- `geo-advise` source now lives in `supabase/functions/geo-advise/` and is
  deployed with JWT verification + a signed-in check (it was open before).
- The app sends one brief (`src/lib/adviseBrief.ts`): strategy, PR profile
  incl. market/region and buyer persona, competitors (+ mentions in the latest
  check), client notes with team-steered items first (12k chars), every
  tracked question with its latest result, the latest check's reach split,
  per-engine mention rate, gap sources (non-competitor sites cited when the
  client is absent) and recent PR activity.
- "Suggest questions" prompt follows GEO practice: conversational buyer
  questions in the client's market, ≥2/3 unbranded, no priming with the
  client's positioning, coverage of buying stages and personas, prioritised by
  the latest gaps, de-duplicated against tracked questions. Each suggestion
  shows persona, stage, impact, reason and the PR lever.
- No silent template fallback for suggestions any more: failures show the
  reason. Backlog "tailor" uses the same brief; a template fallback is shown
  with its reason and is not saved.

## 2026-11-05 — Honest engines, PR impact, fact sheet, Radar evidence, clean-up

- **Engines:** "Copilot" (the OpenAI model asked twice) is no longer measured
  or scored; its weight moved to ChatGPT. Engines without a key (Grok) are left
  out of the score. Migration `20261105130000_drop_copilot_engine`.
- **PR impact:** Coverage & impact shows per placement whether the exact
  article is cited in AI answers, outlet citations before → after, and
  visibility on topic-related questions before → after (like-for-like v2
  checks). `geo_v2_answers()` returns citation URLs without answer text.
  New **Monthly report** area, printable to PDF.
- **Fact sheet + market:** `geo_brands.fact_sheet` (ground truth) and
  `market_country` (ISO). Fact sheet feeds every AI step and geo-measure's
  accuracy grading (error noted on the answer); market is passed as the web
  search location to Claude, OpenAI and Perplexity.
- **Radar / news / listening:** geo-radar gets the measurement brief and must
  cite evidence; news moved from GDELT (TLS never completes from Supabase) to
  Google News RSS; geo-listen asks unprimed, searched questions and requires a
  user or the cron secret.
- **Titles to target** (PR #4 branch) merged into this branch.
- **Security:** geo-run-batch, geo-publish, geo-pilot, geo-diag replaced by a
  410 stub; geo-advise and geo-listen no longer open.
