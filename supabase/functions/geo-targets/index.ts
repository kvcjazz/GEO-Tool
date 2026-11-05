// Titles to target: judges which of the sites the AI engines actually cite for
// a client are realistic places for it to earn coverage, the way a senior PR
// director would, against the story the client has to work with.
//
// The candidates always come from citations (the client's measured answers, or
// a first-look probe of live AI searches), never from the model's own idea of
// "good outlets" — that is what keeps big-reach titles that never feed these
// answers off the list. The model only judges winnability, route in and angle.
//
// One Claude call (no web search). The app saves the result in
// geo_target_titles; the team's calls (relationship / no-go) come back in on
// the next review.
import { callModel, CORS, envKey, json, parseJson } from "../_shared/providers.ts";
import { signedIn } from "../_shared/auth.ts";

const VERDICTS = ["realistic", "stretch", "not_realistic"];
const KINDS = [
  "national",
  "trade",
  "regional",
  "broadcast",
  "podcast",
  "blog",
  "review",
  "directory",
  "community",
  "analyst",
  "reference",
  "academic",
  "competitor",
  "other",
];
/** Enough for a useful shortlist, small enough to answer well inside the time limit. */
const MAX_CANDIDATES = 35;

type Candidate = {
  key?: string;
  domain?: string | null;
  name?: string | null;
  citations?: number;
  gap_citations?: number;
  engines?: string[];
  questions?: number;
  question_types?: string[];
  example_urls?: string[];
  on_list?: boolean;
  tier?: string | null;
  vip?: boolean;
  team_decision?: string | null;
  team_note?: string | null;
  kind_hint?: string | null;
};

type Body = {
  brand?: string;
  website?: string | null;
  sector?: string | null;
  region?: string | null;
  journey?: string | null;
  objective?: string | null;
  audience?: string | null;
  positioning?: string | null;
  themes?: string | null;
  persona?: string | null;
  pr_objectives?: string | null;
  pr_expectations?: string | null;
  newsworthy?: string | null;
  research_budget?: boolean | null;
  context?: string | null;
  competitors?: string[];
  story?: string | null;
  memory?: string | null;
  basis?: string;
  candidates?: Candidate[];
};

function clip(s: unknown, n: number): string {
  const t = s == null ? "" : String(s).trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

function line(label: string, v: unknown, n = 400): string {
  const t = clip(v, n);
  return t ? `\n${label}: ${t}` : "";
}

function candidateLine(c: Candidate): string {
  const bits = [
    `key=${c.key}`,
    c.name ? `name=${clip(c.name, 60)}` : "",
    c.domain ? `domain=${c.domain}` : "",
    `cited ${c.citations || 0}x`,
    c.gap_citations ? `${c.gap_citations}x in answers naming a competitor but not the client` : "",
    c.questions ? `across ${c.questions} questions` : "",
    c.engines?.length ? `engines: ${c.engines.join("/")}` : "",
    c.question_types?.length ? `question types: ${c.question_types.join("/")}` : "",
    c.example_urls?.length ? `cited pages: ${c.example_urls.slice(0, 3).map((u) => clip(u, 120)).join(" | ")}` : "",
    c.on_list ? `ON CLIENT MEDIA LIST${c.tier ? ` (${c.tier}${c.vip ? ", VIP" : ""})` : ""}` : "",
    c.kind_hint ? `site type noted: ${c.kind_hint}` : "",
    c.team_decision === "relationship"
      ? "TEAM: we have a relationship here"
      : c.team_decision === "no_go"
      ? "TEAM: NO-GO, do not recommend"
      : "",
    c.team_note ? `team note: ${clip(c.team_note, 160)}` : "",
  ].filter(Boolean);
  return "- " + bits.join("; ");
}

function prompt(b: Body, candidates: Candidate[]): string {
  const story = clip(b.story, 1200);
  const storyBlock = story
    ? `\n\nTHE STORY TO ASSESS AGAINST (the team is testing this specific story):\n${story}`
    : "\n\nTHE STORY TO ASSESS AGAINST: whatever the client realistically has in flight — " +
      "use 'Newsworthy in flight', the research budget and the strategy context below. " +
      "If there is little, assume only expert commentary from the persona.";
  const basis = b.basis === "probe"
    ? "These sites came from a first-look probe: the client's questions were put to live AI " +
      "engines with web search on, and these are the sites the engines cited. No answers " +
      "have been captured for this client yet."
    : "These sites are the ones the AI engines cited in this client's measured answers.";
  return (
    "You are a director-level PR consultant at Luminous PR with 20 years' experience " +
    "placing B2B and technology stories. You know how each kind of outlet sources its " +
    "content and what an experienced PR person would and would not pitch.\n\n" +
    "Your job: decide which of the sites below this client could REALISTICALLY earn " +
    "coverage, a quote, a listing or a presence on, so the AI engines cite it more. " +
    "Reach and prestige are NOT merits in themselves — a huge title that would never " +
    "run this client's story is a poor target, however famous.\n\n" +
    "CLIENT: " + clip(b.brand, 120) +
    line("Website", b.website, 120) +
    line("Sector", b.sector, 120) +
    line("Region / market", b.region, 120) +
    line("Stage", b.journey, 200) +
    line("Objective", b.objective) +
    line("Target audience", b.audience) +
    line("Positioning", b.positioning) +
    line("Themes", b.themes, 800) +
    line("Spokesperson / persona", b.persona) +
    line("PR objectives", b.pr_objectives) +
    line("Client expectations and constraints (respect these)", b.pr_expectations) +
    line("Newsworthy in flight", b.newsworthy, 800) +
    `\nResearch budget for original data: ${b.research_budget ? "yes" : "no"}` +
    line("Competitors", (b.competitors || []).join(", "), 400) +
    line("Strategy context (team notes, transcripts — weight heavily)", b.context, 3000) +
    line(
      "Outlet track record across the agency (proven = landed or rated realistic; avoid = rated unrealistic)",
      b.memory,
      1500,
    ) +
    storyBlock +
    "\n\nSITES TO JUDGE. " + basis + "\n" +
    candidates.map(candidateLine).join("\n") +
    "\n\nFor EACH site, think like the senior consultant:\n" +
    "1. What is it (publication, trade title, review platform, forum, directory, analyst, " +
    "reference site, competitor's own site…) and how does it get its content — staff " +
    "journalists, contributed articles, expert quotes, roundups and 'best of' lists, " +
    "paid placements, user reviews, community posts, analyst briefings?\n" +
    "2. Would it take THIS story from THIS client with THIS spokesperson, in this region? " +
    "Be honest: national desks rarely run a mid-size B2B firm's news without data or a " +
    "strong hook; trade titles often take expert comment and bylines; 'best X' roundups " +
    "can be pitched for inclusion; review sites are won with customer reviews, not " +
    "pitches; forums are won by genuine participation, never by pitching; Wikipedia " +
    "and similar reference sites cannot be edited by PR (conflict of interest) — only " +
    "independent coverage elsewhere helps there; a competitor's own site is never a target.\n" +
    "3. What is the realistic route in, and the angle from the story that fits it?\n" +
    "Honour the team's calls: a relationship makes a site more winnable; a NO-GO is " +
    "always not_realistic. If you don't genuinely know a site's editorial approach, " +
    "set known=false and say so — never invent an editorial policy.\n\n" +
    "Return ONLY a JSON object, no prose, no code fences:\n" +
    '{"titles":[{"key":"<the key given>","name":"<proper title name, e.g. PRWeek>",' +
    '"kind":"<one of ' + KINDS.join("|") + '>",' +
    '"verdict":"realistic|stretch|not_realistic",' +
    '"priority":<1-5: how much winning it would lift this client\'s AI citations, given ' +
    'how often and where it is cited and how winnable it is>,' +
    '"route":"<route in, max 8 words>",' +
    '"angle":"<the angle from the story to use, max 25 words; empty if not_realistic>",' +
    '"reason":"<why, as a senior PR person would say it, max 30 words>",' +
    '"needs":"<for stretch: what would make it realistic, max 15 words; else empty>",' +
    '"known":true|false}]}\n' +
    "Cover every key exactly once."
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await signedIn(req))) return json({ ok: false, error: "sign-in required" }, 401);

  const body = await req.json().catch(() => ({})) as Body;
  const seen = new Set<string>();
  const candidates = (body.candidates || [])
    .map((c) => ({ ...c, key: String(c.key || c.domain || c.name || "").trim().toLowerCase() }))
    .filter((c) => c.key && !seen.has(c.key) && seen.add(c.key))
    .slice(0, MAX_CANDIDATES);
  if (!body.brand || !candidates.length) {
    return json({ ok: false, error: "brand and candidates required" });
  }
  const key = envKey("anthropic");
  if (!key) return json({ ok: false, error: "no_key", detail: "Missing ANTHROPIC_API_KEY" });

  const out = await callModel("anthropic", key, prompt(body, candidates), 8000);
  if (out.error) return json({ ok: false, error: "call_failed", detail: out.error });
  const parsed = parseJson<{ titles?: Record<string, unknown>[] }>(out.text);
  if (!parsed?.titles) {
    return json({ ok: false, error: "bad_reply", detail: "The review didn't come back as JSON" });
  }

  const byKey = new Map(candidates.map((c) => [c.key, c]));
  const titles = parsed.titles
    .map((t) => {
      const k = String(t.key || "").trim().toLowerCase();
      const c = byKey.get(k);
      if (!c) return null;
      // A no-go is the team's call, whatever the model said.
      const verdict = c.team_decision === "no_go"
        ? "not_realistic"
        : VERDICTS.includes(String(t.verdict))
        ? String(t.verdict)
        : "stretch";
      const kind = String(t.kind || "").toLowerCase();
      return {
        key: k,
        name: clip(t.name || c.name || c.domain || k, 80),
        kind: KINDS.includes(kind) ? kind : "other",
        verdict,
        priority: Math.max(1, Math.min(5, Math.round(Number(t.priority) || 3))),
        route: clip(t.route, 120),
        angle: verdict === "not_realistic" ? "" : clip(t.angle, 300),
        reason: clip(t.reason, 400),
        needs: verdict === "stretch" ? clip(t.needs, 200) : "",
        known: t.known !== false,
      };
    })
    .filter((t): t is NonNullable<typeof t> => !!t);
  const answered = new Set(titles.map((t) => t.key));
  return json({
    ok: true,
    model: out.model,
    titles,
    missing: candidates.filter((c) => !answered.has(c.key)).map((c) => c.key),
  });
});
