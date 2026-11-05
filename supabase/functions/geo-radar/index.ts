// PR Radar briefing: fresh PR ideas (pr_activity) and GEO actions (geo_insight)
// for one client.
//
// Inputs: the client's PR profile, media targets (incl. realistic titles from
// "Titles to target"), opportunities, feasibility memory and earlier titles
// (to avoid repeats), plus — new — the shared client `brief` from the app
// (src/lib/adviseBrief.ts): fact sheet, client notes, and what the latest
// measurement found (reach, weakest engines and questions, sites the engines
// cite when the client is absent, recent PR and whether it is being cited).
// The AI is told to ground ideas in that evidence.
//
// News comes from Google News RSS (see _shared/news.ts). AI failures fall back
// to a template and say why (`source: "template"`, `note`).
import { callAnalyst, CORS, countryCode, json, parseJson } from "../_shared/providers.ts";
import { signedIn } from "../_shared/auth.ts";
import { competitorNews, themeNews, type Article } from "../_shared/news.ts";

type Target = { outlet: string; tier?: string | null; vip?: boolean | null };
type Opp = { title: string; linked_gap?: string | null };

type BriefQuestion = {
  text: string;
  type?: string;
  active?: boolean;
  names_client?: boolean;
  named?: number | null;
  answers?: number | null;
};

type Brief = {
  client?: Record<string, unknown>;
  fact_sheet?: string;
  client_notes?: string;
  questions?: BriefQuestion[];
  latest_check?: {
    new_buyer_reach_pct?: number;
    by_name_reach_pct?: number;
    engine_mention_pct?: Record<string, number>;
    gap_sources?: { domain: string; kind?: string | null; citations: number }[];
  } | null;
  competitors?: { name: string; mentions_last_check?: number | null }[];
  recent_pr?: { date: string; outlet: string; theme?: string | null; cited_by_ai?: boolean }[];
};

type Body = {
  brand?: string;
  sector?: string | null;
  website?: string | null;
  pr_region?: string | null;
  market_country?: string | null;
  pr_journey?: string | null;
  pr_objectives?: string | null;
  pr_expectations?: string | null;
  objective?: string | null;
  positioning?: string | null;
  themes?: string | null;
  audience?: string | null;
  persona?: string | null;
  pr_research_budget?: boolean | null;
  pr_newsworthy?: string | null;
  context?: string | null;
  mediaTargets?: Target[];
  competitors?: string[];
  opportunities?: Opp[];
  existingTitles?: string[];
  feasibilityMemory?: string;
  brief?: Brief;
};

type Item = {
  stream: "pr_activity" | "geo_insight";
  title: string;
  idea: string;
  target_outlets: string;
  hook: string;
  rationale: string;
  impact: number;
  geo_metric: string;
  feasibility: string;
};

const clip = (s: unknown, n: number) => {
  const t = s == null ? "" : String(s);
  return t.length > n ? t.slice(0, n) : t;
};

function newsLines(arts: Article[], n: number): string {
  return arts.slice(0, n).map((a, i) => `${i + 1}. ${a.title} (${a.domain})`).join("\n");
}

/** What the latest measurement says, in a few lines the strategist can act on. */
function evidenceBlock(br: Brief | undefined): string {
  if (!br) return "";
  const parts: string[] = [];
  const lc = br.latest_check;
  if (lc) {
    parts.push(
      `Found by new buyers (named in answers to questions that don't name the client): ${lc.new_buyer_reach_pct ?? "?"}%. ` +
        `Recognised by name: ${lc.by_name_reach_pct ?? "?"}%.`,
    );
    const eng = Object.entries(lc.engine_mention_pct || {}).sort((a, b) => a[1] - b[1]);
    if (eng.length) parts.push("Named by engine: " + eng.map(([e, p]) => `${e} ${p}%`).join(", ") + ".");
    if (lc.gap_sources?.length) {
      parts.push(
        "Sites the AI engines cite in answers that leave the client out (most cited first) — " +
          "coverage on these is what the engines read:\n" +
          lc.gap_sources
            .slice(0, 15)
            .map((g) => `- ${g.domain}${g.kind ? ` (${g.kind})` : ""}: ${g.citations} citations`)
            .join("\n"),
      );
    }
  }
  const weak = (br.questions || [])
    .filter((q) => q.active !== false && !q.names_client && q.answers && (q.named || 0) / q.answers < 0.5)
    .sort((a, b) => (a.named || 0) / (a.answers || 1) - (b.named || 0) / (b.answers || 1))
    .slice(0, 8);
  if (weak.length) {
    parts.push(
      "Buyer questions where the client is missing from most answers:\n" +
        weak.map((q) => `- "${q.text}" — named in ${q.named || 0} of ${q.answers}`).join("\n"),
    );
  }
  const comps = (br.competitors || []).filter((c) => c.mentions_last_check != null);
  if (comps.length) {
    parts.push(
      "Competitor mentions in the latest check: " +
        comps.map((c) => `${c.name} ${c.mentions_last_check}`).join(", ") + ".",
    );
  }
  if (br.recent_pr?.length) {
    parts.push(
      "Recent PR (and whether AI engines cite it yet):\n" +
        br.recent_pr
          .slice(0, 8)
          .map((p) => `- ${p.date} ${p.outlet}${p.theme ? ` — ${p.theme}` : ""}: ${p.cited_by_ai ? "cited" : "not cited yet"}`)
          .join("\n"),
    );
  }
  return parts.length ? "\n\nWHAT THE LATEST AI-VISIBILITY CHECK FOUND:\n" + parts.join("\n") : "";
}

function prompt(b: Body, news: Article[], compNews: Article[]): string {
  const br = b.brief;
  const targets = (b.mediaTargets || [])
    .map((t) => t.outlet + (t.vip ? " (VIP)" : "") + (t.tier ? ` [${t.tier}]` : ""))
    .join("; ");
  const opps = (b.opportunities || [])
    .map((o) => o.title + (o.linked_gap ? ` (gap: ${o.linked_gap})` : ""))
    .join("; ");
  const notes = br?.client_notes || b.context || "";
  const existing = (b.existingTitles || []).slice(0, 60);
  return (
    "You are a director-level technology PR strategist at Luminous PR who knows what UK and " +
    "international media will and will not accept, and who runs Generative Engine " +
    "Optimisation: getting clients named and cited in AI assistants' answers.\n\n" +
    `CLIENT: ${b.brand || ""}${b.website ? ` (${b.website})` : ""}.\n` +
    `Sector: ${b.sector || ""}.\n` +
    `Regional market & stage: ${b.pr_region || ""} / ${b.pr_journey || ""}.\n` +
    `PR objectives: ${b.pr_objectives || b.objective || ""}.\n` +
    `Client expectations of PR: ${b.pr_expectations || ""}.\n` +
    `Positioning: ${b.positioning || ""}.\nThemes: ${b.themes || ""}.\n` +
    `Audience / who must know them: ${b.persona || b.audience || ""}.\n` +
    `Market-research budget: ${b.pr_research_budget ? "yes" : "no"}.\n` +
    `Newsworthy in flight: ${b.pr_newsworthy || ""}.\n` +
    `Media targets (prefer these; never invent unrealistic outlets): ${targets || "none"}.\n` +
    `Competitors: ${(b.competitors || []).join(", ")}.\n` +
    `Current GEO opportunities: ${opps || "none"}.` +
    (br?.fact_sheet
      ? "\n\nFACT SHEET (confirmed by the client; never contradict it, use its proof points " +
        "and spokespeople):\n" + clip(br.fact_sheet, 4000)
      : "") +
    (notes
      ? "\n\nCLIENT NOTES (strategy calls, documents; lines marked [Team guidance …] are the " +
        "team's instructions — follow them):\n" + clip(notes, 8000)
      : "") +
    evidenceBlock(br) +
    (news.length
      ? "\n\nBREAKING NEWS (last 14 days) for newsjacking — propose fast reactive angles tying " +
        "the client to a relevant story, and name the story in the hook:\n" + newsLines(news, 12)
      : "") +
    (compNews.length
      ? "\n\nCOMPETITOR NEWS (last 14 days) — for differentiation or defensive angles:\n" +
        newsLines(compNews, 8)
      : "") +
    (b.feasibilityMemory
      ? "\n\nOUTLET FEASIBILITY MEMORY (learned from what has worked and what the team rated " +
        "unrealistic). Prefer PROVEN outlets, avoid AVOID outlets, and reflect this in " +
        "feasibility:\n" + clip(b.feasibilityMemory, 1500)
      : "") +
    (existing.length
      ? "\n\nALREADY SUGGESTED before — do NOT repeat or closely paraphrase:\n- " +
        existing.map((t) => clip(t, 90)).join("\n- ")
      : "") +
    "\n\nProduce two streams:\n" +
    "(1) pr_activity — about 6 concrete PR ideas, including 1–2 newsjacking angles where a " +
    "story is genuinely relevant. Where the check above lists sites the engines cite when the " +
    "client is absent, favour realistic placements on those (or outlets like them) — that is " +
    "how coverage turns into AI visibility. Say which buyer question(s) each idea should move.\n" +
    "(2) geo_insight — about 4 actions beyond media relations that raise AI visibility: owned " +
    "content that answers the weakest buyer questions, directories/rankings/review sites among " +
    "the gap sources, correcting facts engines get wrong, entity consistency. Each must cite " +
    "the specific evidence above it acts on (a site, a question, an engine, a number).\n" +
    "Be realistic about outlets — prefer listed targets, honour the feasibility memory, never " +
    "suggest a placement a senior PR director knows would not happen. Feasibility High, Medium " +
    "or Low. Impact 1–5 against the objectives. For geo_insight set geo_metric (Mention Rate, " +
    "Share of Voice, Citation Share, Position, Sentiment, Accuracy).\n\n" +
    'Return ONLY a JSON object, no prose, no code fences: {"items":[{"stream":"pr_activity|geo_insight",' +
    '"title":"…","idea":"…","target_outlets":"…","hook":"…","rationale":"…","impact":1-5,' +
    '"geo_metric":"…","feasibility":"High|Medium|Low"}]}'
  );
}

function template(b: Body, news: Article[]): Item[] {
  const brand = b.brand || "this client";
  const themes = String(b.themes || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const t0 = themes[0] || b.sector || "the category";
  const targets = b.mediaTargets || [];
  const vip = targets.filter((t) => t.vip).map((t) => t.outlet);
  const any = targets.map((t) => t.outlet);
  const tgt = (i: number) => (any.length ? any[i % any.length] : "a relevant target outlet");
  const gaps = b.brief?.latest_check?.gap_sources || [];
  const items: Item[] = [];
  if (news.length) {
    items.push({
      stream: "pr_activity",
      title: "Newsjack: " + clip(news[0].title, 80),
      idea: `React fast to "${clip(news[0].title, 120)}" (${news[0].domain}) with expert commentary positioning ${brand} on ${t0}.`,
      target_outlets: vip[0] || tgt(0),
      hook: "Breaking news: " + news[0].domain,
      rationale: "Timely reactive comment is the quickest route to coverage while the story is live.",
      impact: 5,
      geo_metric: "Mention Rate",
      feasibility: vip.length ? "High" : "Medium",
    });
  }
  items.push({
    stream: "pr_activity",
    title: "Founder commentary on " + t0,
    idea: `Offer ${brand} as an expert voice on ${t0} with a quotable point of view.`,
    target_outlets: vip[0] || tgt(0),
    hook: b.pr_newsworthy ? "Anchor to: " + clip(b.pr_newsworthy, 120) : "Thought-leadership hook",
    rationale: "Thought-leadership builds credibility.",
    impact: 4,
    geo_metric: "Citation Share",
    feasibility: vip.length ? "High" : "Medium",
  });
  if (gaps[0]) {
    items.push({
      stream: "geo_insight",
      title: "Get onto " + gaps[0].domain,
      idea: `${gaps[0].domain} is cited ${gaps[0].citations} times in AI answers that leave ${brand} out. Secure coverage, a listing or a contribution there.`,
      target_outlets: gaps[0].domain,
      hook: "From the latest AI-visibility check",
      rationale: "Engines already trust this source for the client's buyer questions.",
      impact: 5,
      geo_metric: "Citation Share",
      feasibility: "Medium",
    });
  }
  items.push({
    stream: "geo_insight",
    title: "Strengthen the brand entity",
    idea: `Ensure ${brand} has a consistent, accurate entity footprint so engines describe it correctly.`,
    target_outlets: "",
    hook: "Evergreen GEO foundation",
    rationale: "Accurate entity data underpins every GEO metric.",
    impact: 3,
    geo_metric: "Accuracy",
    feasibility: "High",
  });
  return items;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await signedIn(req))) return json({ error: "Sign-in required." }, 401);
  const b = (await req.json().catch(() => ({}))) as Body;
  const country = countryCode(b.market_country ?? b.brief?.client?.market_country);

  const [theme, comp] = await Promise.all([
    themeNews({ themes: b.themes, brand: b.brand, sector: b.sector, country }),
    competitorNews(b.competitors || [], country),
  ]);
  const news = theme.articles;
  const compNews = comp.articles;
  const newsError = theme.error || comp.error;

  const out = await callAnalyst(prompt(b, news, compNews), 8000);
  const parsed = out.error ? null : parseJson<{ items?: Record<string, unknown>[] }>(out.text);
  if (!parsed?.items?.length) {
    return json({
      items: template(b, news),
      news,
      competitorNews: compNews,
      source: "template",
      note: out.error || "the AI reply could not be read",
      newsError,
    });
  }
  const items: Item[] = parsed.items.map((p): Item => ({
    stream: p.stream === "geo_insight" ? "geo_insight" : "pr_activity",
    title: String(p.title || ""),
    idea: String(p.idea || ""),
    target_outlets: String(p.target_outlets || ""),
    hook: String(p.hook || ""),
    rationale: String(p.rationale || ""),
    impact: Math.max(1, Math.min(5, Math.round(Number(p.impact) || 3))),
    geo_metric: String(p.geo_metric || ""),
    feasibility: ["High", "Medium", "Low"].includes(String(p.feasibility)) ? String(p.feasibility) : "Medium",
  })).filter((i) => i.title);
  return json({
    items,
    news,
    competitorNews: compNews,
    source: "ai",
    model: out.model,
    fellBackFrom: out.fellBackFrom,
    newsError,
  });
});
