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

## 2026-11-05 — Share of voice v2, stop/resume, AI fallback, client switching

- **Share of voice v2:** `geo_responses.entities` lists every brand each
  answer names (order, recommended, client found in code) — filled by
  geo-measure for new answers and by `geo-entities` for older ones. Headline
  SOV = client's points ÷ all brands' points on questions that don't name the
  client (recommended = 2, mention = 1, averaged over samples); branded SOV
  shown separately; old formula used only for answers without brand data.
  Client setup → Competitors lists every brand named with one-click Track.
  Scores re-baseline when this lands (SOV is 25% of the GEO score).
- **Stop / resume:** `geo_cancel_run(rid)` cancels queued and running jobs
  (`cancelled` status; geo-measure doesn't save a cancelled job). Header has
  Stop while measuring and Measure now / Resume with the missing count.
- **New questions:** adding questions offers to measure them immediately.
- **AI fallback:** analysis calls go through `callAnalyst` (Claude → OpenAI →
  Gemini); Claude calls get ≥16k tokens so thinking can't empty the reply.
- **Client switching:** All clients home, sidebar client block, ⌘K switcher,
  `?client=` in the URL, last client remembered.

## 2026-11-05 — Overview explainers: engine chart + strategy summary

- **GEO score by engine** now has a "What this shows / Why the bars differ"
  note (`src/lib/engineExplainer.ts`). It is worked out from the same numbers
  as the chart, with no AI call: the top and bottom engine and the weighted
  metric that most explains each (vs the other engines' average), a note when
  the client isn't named at all, small-sample warnings (<10 answers), engines
  not measured, and the engine weights behind the headline score.
- **Visibility strategy** on the Overview is now a short AI summary (headline
  + 2–4 bullets) of the strategy and PR profile in Client setup, instead of the
  raw fields. `geo-advise` gained `mode: "summary"` (v14); it reads only the
  strategy/PR-profile fields, never client notes, PR expectations or budget,
  because clients see this banner.
- Stored in `geo_brands.strategy_summary` (+ `_source` fingerprint and
  `_edited`), migration `20261105210000_strategy_summary` (applied). The
  Overview writes it when missing, rewrites it when Client setup changes, and
  the team can ✎ Edit / ✨ Rewrite it. An edited summary is never overwritten
  automatically; the team sees "Client setup has changed" with a rewrite link.
- Not yet clicked through signed in (no sign-in from the build container).
  `geo-advise` v14 boots and still refuses unsigned calls (checked via pg_net).

## 2026-11-05 — Search demand (SEO input), phase 1

Search data now helps choose which questions to ask the AI engines. SEO and GEO
are kept visibly apart: everything from search data is teal and labelled
"🔍 SEO"; GEO results (answers, scores) are unchanged and never use it.

- **DB (applied live, migration `search_demand`):** new `geo_search_terms`
  table (per-client RLS, cascades on client delete) and `seo_seed`,
  `seo_demand`, `seo_demand_kind` on `geo_prompts`. SQL in
  `supabase/migrations/20261105220000_search_demand.sql`.
- **Client setup → Search demand:** import a Search Console *Queries.csv*,
  Semrush/Ahrefs/Keyword Planner export (UTF-16 handled) or a pasted list
  (`src/lib/searchDemand.ts`). Re-imports merge figures rather than blanking
  them. Side-by-side "SEO vs GEO" explainer; table shows Google rank (labelled
  as Google, so it's never read as the AI "Position" metric) and which tracked
  question each term became. Optional checklist step.
- **Suggest from search demand:** `geo-advise` v15 takes
  `focus: "search"` + `brief.search_demand`. Every suggestion must name the
  `seo_seed` it came from; the function drops any whose seed isn't a real
  imported term, so the SEO label can't point at an invented search. The
  strategy-led "Suggest questions" is unchanged.
- **Labels:** SEO-drafted questions show their search term in Client setup and
  an "SEO-informed" chip in Answers. Scoring is untouched.
- Verified: build + typecheck, parser cases (GSC, Keyword Planner, Semrush,
  pasted), edge-function typecheck + shared tests (run under Node; Deno not
  available in the container), UI screenshots against mocked data, deployed
  function boots. Not yet run end-to-end with a signed-in user and real AI call.
- Branch note: built on `claude/cool-euler-mymkvt` (main + PR #6) because PR #6
  — whose `summary` mode is live — was merged into that branch, not `main`.

## 2026-11-12 — AI spend: logging, duplicate-check guards, fewer grading calls

Why: an audit of `geo_measure_jobs` found ~36% of completed measurement jobs
since v2 went live were duplicates — 358 of 1,308 re-measured a question ×
engine already done in the same check ("Re-measure now" re-queues every cell),
and a further ~115 belonged to a Hippo November check replaced 4 days later by
a manual one. Part of October's duplication was v2 build/testing. Nothing
recorded what any AI call cost, so none of this was visible, while the
Anthropic and OpenAI accounts hit their spend/quota limits.

- **Spend log:** `geo_ai_usage` (admin-only RLS) gets one row per provider
  request — function, purpose, client, model, input/output tokens (thinking
  included), billed web searches, Perplexity's reported cost, failures.
  Written best-effort by `callModel` in `_shared/providers.ts` when a call
  carries a `usage` label; every AI call site now passes one. The app adds the
  open client's `brand_id` to AI function bodies (`src/lib/callFn.ts`).
- **Admin → AI spend** (`src/components/AiSpendPanel.tsx`): this month / last
  month / 3 months, by client and by purpose, failed calls, and a $ estimate
  from per-model prices an admin enters (`geo_ai_rates`, longest model-prefix
  match). Roll-up via `geo_ai_usage_summary(from, to)`.
- **Duplicate checks:** "Run monthly check" warns when the client was checked
  in the last 25 days and points to "Measure now" (missing only); both it and
  the renamed "Re-measure everything…" show the cost (pairs × samples searched
  answers + analysis calls) and refuse while a check is running. The new-question
  prompts now count the other missing measurements they also queue. The cron
  calls `geo_monthly_snapshots(3, 7)`, which skips clients with a v2 check
  started in the last 7 days.
- **Grading:** `geo-measure` rates all samples that name the client in ONE call
  per job (was one per sample) — same engine as judge, so scores stay
  comparable. Code moved to `_shared/grade.ts` with tests.
- **Small leaks:** the Overview strategy summary auto-rewrites at most once per
  session per client + strategy version (read-only viewers, whose save is
  refused, used to trigger it on every visit). `geo-run` (v1) is listed for the
  410 retired stub.
- **Not changed here:** the `geo-entities` attempt counter — the live DB has
  `entities_attempts` + `geo_entities_failed()` (migration
  `entities_attempt_limit`, applied 2026-11-12 by another session) but the
  deployed function doesn't increment it yet; that session owns the fix.
- **Next spend levers (not built):** adaptive sampling (1 sample, more only
  when borderline/changed); an independent, cheaper judge doing grading +
  brand extraction in one call (methodology change — needs a comparison run
  and re-baseline); listening reusing the monthly answers; queueing only
  engines with keys (Grok jobs are skipped at no AI cost).
- Verified: `next build`; `tsc`; `deno check` all functions; 33 edge tests
  (10 new: usage parsing per provider, failure logging, batched grading); the
  migration run in PGlite against a stand-in schema (cron skip rules, roll-up,
  admin-only, client delete keeps spend, re-runnable); spend panel rendered
  with sample data at desktop + phone width.
- **To go live:** apply migration `20261112150000_ai_usage_and_check_guards`;
  deploy geo-measure, geo-advise, geo-classify-sources, geo-coverage-meta,
  geo-entities, geo-listen, geo-radar, geo-targets; deploy `retired` over
  `geo-run`; deploy the app.

## 2026-11-12 — UX round: monthly cycle, plan, answers, competitors, onboarding

Built from a UX review of main (team workflow + GEO/PR practice). All in
`claude/eloquent-hopper-a880d6`; needs migration
`20261112170000_ux_plan_answers_samples` (applied after
`20261112150000_ai_usage_and_check_guards`). Screens degrade gracefully before
it is applied (samples default to 3; due dates/override/replaces fail to save
with a message or save without the extra field).

- **Automatic check visible:** context bar shows "Next auto check 1 Dec" (or
  that it will skip this client). Samples per question are a saved client
  setting (`geo_brands.measure_samples`, 1–5) used by manual checks and the
  cron (`geo_monthly_snapshots` now uses it); Admin control is a select with
  cost guidance.
- **Overview:** score change is vs the last check (as on All clients and the
  Report), since-first-check second; no more double minus. New "What changed"
  (questions gained/lost an engine, reach before → after) and "Needs attention"
  (wrong facts, questions that name other brands but never the client,
  negative answers) with links to filtered answers. Shared logic in
  `src/lib/changes.ts`, also used by the Report. Top actions open the action in
  the plan. Client view: plain-language "How the score works" instead of the
  weights table.
- **Questions:** rewording a measured question creates a new question
  (`geo_prompts.replaces`) and retires the old one; typo-level edits save in
  place. Deleting questions, placements and mentions asks first.
- **Action plan:** High/Medium/Low priority; inline title, owner, due date
  (`geo_opportunities.due_date`, overdue flagged), impact/effort; Open / Done /
  Parked filters; "+ Add an action"; delete with confirm. Client view:
  In progress / Coming up / Done only.
- **Ideas inbox:** three actions per card; 👍/👎 removed (accept/save already
  count as realistic, dismiss as not); dismiss reasons are inline chips;
  accepted ideas leave the inbox; plain wording (Get new ideas, What's worked
  with outlets, Content & technical).
- **Answers:** filters "Others named, not <client>" and "Gets facts wrong";
  "Not fully measured" list with Measure what's missing; overrides record
  who/when/original (`geo_responses.override`), show "✎ edited" and can be
  restored. New **Competitors** tab (`src/lib/competitors.ts`): questions each
  named brand wins while the client is absent, head-to-head, one-click Track.
- **Onboarding:** Admin → Add a client is a two-step wizard drafting editable,
  mostly unbranded starter questions (`src/lib/starterQuestions.ts`); no empty
  old-method run. Setup checklist flags question sets under two thirds
  unbranded.
- **Other:** Admin area shown to account admins only; client view hides tiers
  below Tier 1; "Enter answers by hand" adds rows for connected engines only
  (blank rows for keyless engines used to score as "not named"); jargon
  removed (capture grid, Prompt, Client PR Profile, Radar briefing).
- Verified: build, tsc, lint (no new errors — the 5 remaining are on main);
  lib logic run under Deno (changes, competitors, starter questions);
  migrations run in PGlite (per-client samples in cron, check constraint,
  `replaces` on delete, re-runnable); screens rendered with mocked data and
  checked: Overview team/client, Answers filters, Competitors, Action plan
  team/client, Ideas dismiss, new-client wizard.
- Not verified signed in against live data (no sign-in from the container).

## 2026-11-12 — Deployed live

- Migrations applied: `ai_usage_and_check_guards`, `ux_plan_answers_samples`
  (cron now `select public.geo_monthly_snapshots(3, 7);`, using each client's
  `measure_samples`).
- Edge functions deployed from this branch (verify_jwt unchanged):
  geo-entities v2 (also counts billed failed reads in `entities_attempts`, so
  the 2-minute backfill stops after 3), geo-measure v7, geo-advise v16,
  geo-classify-sources v4, geo-targets v4, geo-listen v11, geo-radar v11,
  geo-coverage-meta v5; `retired` stub over geo-run (v11, 410).
- Boot-checked each with a harmless request via pg_net (expected 400/401/410
  answers from the new code). Not yet seen: a real measurement or AI call
  writing to `geo_ai_usage` — check Admin → AI spend after the next check.
