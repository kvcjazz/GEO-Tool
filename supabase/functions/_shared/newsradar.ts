// Breaking-news radar: news from the last 14 days that a client's PR team
// could use, each with a short snippet and why it matters for PR and for GEO.
//
// Three cheap AI steps around two news sources (geo-news runs them):
//   1. plan   — a PR strategist reads the client profile and decides which
//               stories to look for (search angles), not just the client's name
//   2. search — Google News RSS for each angle (free, real dates) plus Claude
//               with web search for the same angles (finds what RSS misses)
//   3. rank   — the strategist keeps the usable stories and writes the snippet,
//               PR angle and GEO angle for each
//
// The AI never supplies a link or a date that reaches the screen unchecked:
// stories from the AI search are kept only if their URL is one its searches
// returned and their date falls in the window, and the ranking step refers to
// stories by number, so titles, links and dates always come from the sources.
import type { Article } from "./news.ts";
import type { SearchSource } from "./providers.ts";

/** The cheapest Claude model that does this well (planning, ranking, search). */
export const NEWS_MODEL = "claude-haiku-5-5";
export const WINDOW_DAYS = 14;

export type ClientProfile = {
  name: string;
  website?: string | null;
  sector?: string | null;
  market?: string | null;
  market_country?: string | null;
  objective?: string | null;
  positioning?: string | null;
  audience?: string | null;
  themes?: string | null;
  buyer_persona?: string | null;
  stage?: string | null;
  pr_objectives?: string | null;
  newsworthy?: string | null;
  competitors: string[];
  media_targets: string[];
  fact_sheet?: string | null;
  client_notes?: string | null;
};

/** What the latest AI-visibility check found, as the app's brief sends it. */
export type GeoEvidence = {
  questions?: {
    text: string;
    active?: boolean;
    names_client?: boolean;
    named?: number | null;
    answers?: number | null;
  }[];
  latest_check?: {
    new_buyer_reach_pct?: number;
    engine_mention_pct?: Record<string, number>;
    brands_named?: { name: string; share_pct: number; is_client: boolean }[];
    gap_sources?: { domain: string; kind?: string | null; citations: number }[];
  } | null;
};

export type Angle = { topic: string; query: string; why: string };

export type Candidate = Article & {
  kind: "theme" | "competitor";
  found_by: "google" | "ai" | "both";
  /** One factual sentence from the article (AI search only). */
  summary?: string;
  /** The search angle that found it. */
  angle?: string;
};

export type Pick = Candidate & {
  snippet: string;
  pr_angle: string;
  geo_angle: string;
  relevance: number;
};

const clip = (s: unknown, n: number) => {
  const t = s == null ? "" : String(s).trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
};

const day = (d: Date) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------- prompts --

function line(label: string, v: unknown, n = 1500): string {
  const t = clip(v, n);
  return t ? `${label}: ${t}\n` : "";
}

export function profileBlock(p: ClientProfile): string {
  return (
    `CLIENT: ${p.name}${p.website ? ` (${p.website})` : ""}\n` +
    line("Sector", p.sector, 300) +
    line("Market", [p.market, p.market_country].filter(Boolean).join(" / "), 120) +
    line("Stage", p.stage, 200) +
    line("Business objective", p.objective) +
    line("PR objectives", p.pr_objectives) +
    line("Positioning", p.positioning) +
    line("Themes and narratives", p.themes, 3000) +
    line("Audience", p.audience) +
    line("Buyer persona", p.buyer_persona) +
    line("Newsworthy in flight", p.newsworthy) +
    line("Competitors", p.competitors.join(", "), 400) +
    line("Media targets", p.media_targets.join("; "), 600) +
    line("Fact sheet (confirmed by the client)", p.fact_sheet, 2500) +
    line("Client notes", p.client_notes, 2500)
  );
}

/** The GEO picture in a few lines: what buyers ask AI assistants, and who gets cited. */
export function geoBlock(e: GeoEvidence | null | undefined): string {
  if (!e) return "";
  const parts: string[] = [];
  const weak = (e.questions || [])
    .filter((q) => q.active !== false && !q.names_client)
    .sort((a, b) => (a.named || 0) / (a.answers || 1) - (b.named || 0) / (b.answers || 1))
    .slice(0, 10);
  if (weak.length) {
    parts.push(
      "Buyer questions people ask AI assistants (client named in how many answers):\n" +
        weak
          .map((q) => `- "${clip(q.text, 160)}"` + (q.answers ? ` — ${q.named || 0} of ${q.answers}` : ""))
          .join("\n"),
    );
  }
  const lc = e.latest_check;
  if (lc?.new_buyer_reach_pct != null) {
    parts.push(`Named in ${lc.new_buyer_reach_pct}% of answers to buyer questions that don't name the client.`);
  }
  if (lc?.brands_named?.length) {
    parts.push(
      "Brands AI assistants name instead: " +
        lc.brands_named
          .filter((b) => !b.is_client)
          .slice(0, 8)
          .map((b) => `${b.name} ${b.share_pct}%`)
          .join(", ") + ".",
    );
  }
  if (lc?.gap_sources?.length) {
    parts.push(
      "Sites AI assistants cite when they leave the client out (coverage there is what they read): " +
        lc.gap_sources
          .slice(0, 12)
          .map((g) => `${g.domain} (${g.citations})`)
          .join(", ") + ".",
    );
  }
  return parts.length ? "\nGEO PICTURE (from the latest AI-visibility check):\n" + parts.join("\n") + "\n" : "";
}

const STRATEGIST =
  "You are a senior PR strategist at a technology PR agency. You also run Generative Engine " +
  "Optimisation (GEO): getting clients named and cited when people ask AI assistants such as " +
  "ChatGPT, Gemini, Perplexity and Claude about their category. AI assistants build answers " +
  "from recent, credible coverage and the sites they trust.\n\n";

export function planPrompt(p: ClientProfile, e: GeoEvidence | null | undefined, now: Date): string {
  return (
    STRATEGIST +
    `Today is ${day(now)}.\n\n` +
    profileBlock(p) +
    geoBlock(e) +
    "\nDecide which breaking news from the last 14 days this client's team should be watching " +
    "for PR opportunities: stories journalists are covering now where the client has a credible, " +
    "newsworthy point of view. Think like a PR director — regulation and policy moves, market " +
    "data and reports, big deals and launches in the sector, problems the client's buyers face, " +
    "events and debates the target media are running — not just the client's own name.\n\n" +
    "Give 5 search angles. For each:\n" +
    "- topic: a short label\n" +
    "- query: 2 to 6 plain words a news search engine will match (no quotes, no OR, no " +
    "client name); specific enough to find stories in this client's market\n" +
    "- why: one sentence on the opportunity\n\n" +
    'Return ONLY a JSON object, no prose: {"angles":[{"topic":"…","query":"…","why":"…"}]}'
  );
}

export function searchPrompt(p: ClientProfile, angles: Angle[], now: Date): string {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86400_000);
  return (
    `Today is ${day(now)}. Find real news stories published between ${day(since)} and ` +
    `${day(now)} that the PR team for ${p.name}` +
    (p.sector ? ` (${clip(p.sector, 120)})` : "") +
    (p.market ? `, market: ${clip(p.market, 60)}` : "") +
    " could use for reactive comment and PR ideas.\n\n" +
    "Search these angles:\n" +
    angles.map((a) => `- ${a.topic}: ${a.query}`).join("\n") +
    (p.competitors.length ? `\nAlso look for news about these competitors: ${p.competitors.slice(0, 8).join(", ")}.` : "") +
    "\n\nRules: only stories that appear in your search results and were published in that " +
    "window; copy each story's URL exactly as the search result gives it; skip undated pages, " +
    "evergreen guides and anything older. Prefer news outlets and trade press.\n\n" +
    'Return ONLY a JSON object, no prose: {"stories":[{"title":"…","url":"…","outlet":"…",' +
    '"date":"YYYY-MM-DD","summary":"one factual sentence from the article","angle":"the topic it ' +
    'matches","about_competitor":false}]} — up to 15 stories.'
  );
}

export function rankPrompt(
  p: ClientProfile,
  e: GeoEvidence | null | undefined,
  cands: Candidate[],
  now: Date,
): string {
  const list = cands
    .map((c, i) =>
      `[${i + 1}] (${c.kind}) ${clip(c.title, 200)} — ${c.domain}, ${c.seendate.slice(0, 10)}` +
      (c.summary ? `\n    Summary: ${clip(c.summary, 300)}` : "")
    )
    .join("\n");
  return (
    STRATEGIST +
    `Today is ${day(now)}.\n\n` +
    profileBlock(p) +
    geoBlock(e) +
    `\nNEWS FROM THE LAST ${WINDOW_DAYS} DAYS (numbered; "competitor" = found by searching for a competitor):\n` +
    list +
    "\n\nPick the stories this client's team could genuinely use to inspire PR activity. Leave " +
    "out stories with no credible link to the client, and stories that are about something " +
    "else that shares the client's name. For each pick:\n" +
    "- n: the story's number\n" +
    "- snippet: what the story says, at most 25 words, using only the headline and summary " +
    "above — never add facts\n" +
    "- pr_angle: why it is relevant to the client and how the team could use it (reactive " +
    "comment, data, byline, briefing; which outlet or journalist), at most 40 words\n" +
    "- geo_angle: why it matters for GEO — which buyer question AI assistants get asked it " +
    "ties to, or which site AI assistants cite that coverage would land on, and how it could " +
    "get the client named or cited in AI answers; at most 40 words. Be concrete; if the GEO " +
    "link is weak, say so in a few words\n" +
    "- relevance: 1 to 5\n\n" +
    "Best first; up to 12 theme stories and up to 5 competitor stories.\n" +
    'Return ONLY a JSON object, no prose: {"picks":[{"n":1,"snippet":"…","pr_angle":"…",' +
    '"geo_angle":"…","relevance":4}]}'
  );
}

// ---------------------------------------------------------------- parsing --

/** Pull the first JSON object out of a reply, tolerating code fences and prose. */
function firstJson(text: string): Record<string, unknown> | null {
  const t = (text || "").replace(/```json/gi, "").replace(/```/g, "");
  const i = t.indexOf("{");
  const k = t.lastIndexOf("}");
  if (i < 0 || k <= i) return null;
  try {
    return JSON.parse(t.slice(i, k + 1));
  } catch {
    return null;
  }
}

export function parseAngles(text: string): Angle[] {
  const j = firstJson(text);
  const raw = Array.isArray(j?.angles) ? (j!.angles as Record<string, unknown>[]) : [];
  const out: Angle[] = [];
  const seen = new Set<string>();
  for (const a of raw) {
    const query = String(a?.query || "")
      .replace(/["“”]/g, "")
      .replace(/\b(OR|AND)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 8)
      .join(" ");
    if (!query || seen.has(query.toLowerCase())) continue;
    seen.add(query.toLowerCase());
    out.push({ topic: clip(a?.topic || query, 60), query, why: clip(a?.why, 200) });
  }
  return out.slice(0, 6);
}

/** Lowercase host without www, path without trailing slash or fragment. */
export function normUrl(u: string): string {
  try {
    const x = new URL(u.trim());
    const host = x.hostname.replace(/^www\./, "").toLowerCase();
    return host + x.pathname.replace(/\/+$/, "") + x.search;
  } catch {
    return "";
  }
}

/** A search result's age ("3 days ago", "November 10, 2026") as an ISO date. */
export function pageAgeDate(age: string, now: Date): string | null {
  const a = (age || "").trim().toLowerCase();
  if (!a) return null;
  const rel = a.match(/^(\d+)\s+(minute|hour|day|week|month)s?\s+ago$/);
  if (rel) {
    const ms = { minute: 60e3, hour: 3600e3, day: 86400e3, week: 7 * 86400e3, month: 30 * 86400e3 }[
      rel[2] as "minute" | "hour" | "day" | "week" | "month"
    ];
    return new Date(now.getTime() - Number(rel[1]) * ms).toISOString();
  }
  if (a === "yesterday") return new Date(now.getTime() - 86400e3).toISOString();
  const d = new Date(age);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** True when an ISO date is inside the window (a day of slack for time zones). */
export function inWindow(iso: string, now: Date, days = WINDOW_DAYS): boolean {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return false;
  return t >= now.getTime() - (days + 1) * 86400e3 && t <= now.getTime() + 86400e3;
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Stories from the AI web search, kept only if the URL is one the searches
 * returned and the date (the model's, else the search result's age) is in the
 * window. Everything else is dropped as possibly made up.
 */
export function parseFound(text: string, sources: SearchSource[], now: Date): Candidate[] {
  const j = firstJson(text);
  const raw = Array.isArray(j?.stories) ? (j!.stories as Record<string, unknown>[]) : [];
  const byUrl = new Map(sources.map((s) => [normUrl(s.url), s]));
  const out: Candidate[] = [];
  for (const s of raw) {
    const url = String(s?.url || "").trim();
    const src = byUrl.get(normUrl(url));
    if (!src) continue;
    const modelDate = /^\d{4}-\d{2}-\d{2}/.test(String(s?.date || "")) ? new Date(String(s.date)) : null;
    const seen = modelDate && !isNaN(modelDate.getTime())
      ? modelDate.toISOString()
      : pageAgeDate(src.pageAge, now);
    if (!seen || !inWindow(seen, now)) continue;
    const title = clip(s?.title || src.title, 240);
    if (!title) continue;
    out.push({
      title,
      url: src.url,
      domain: hostOf(src.url) || clip(s?.outlet, 60),
      seendate: seen,
      kind: s?.about_competitor === true ? "competitor" : "theme",
      found_by: "ai",
      summary: clip(s?.summary, 300) || undefined,
      angle: clip(s?.angle, 60) || undefined,
    });
  }
  return out;
}

const titleKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 70);

/**
 * One list from every source, newest first. A story found by both keeps the
 * AI's real article link and summary and is marked "both"; a story found as
 * both theme and competitor news counts as competitor news.
 */
export function mergeCandidates(lists: Candidate[][], now: Date, max = 60): Candidate[] {
  const by = new Map<string, Candidate>();
  for (const c of lists.flat()) {
    if (!c.title || !c.url || !inWindow(c.seendate, now)) continue;
    const k = titleKey(c.title);
    const had = by.get(k);
    if (!had) {
      by.set(k, { ...c });
      continue;
    }
    const ai = had.found_by !== "google" ? had : c.found_by !== "google" ? c : null;
    by.set(k, {
      ...had,
      url: ai?.url || had.url,
      domain: ai?.domain || had.domain,
      summary: had.summary || c.summary,
      angle: had.angle || c.angle,
      kind: had.kind === "competitor" || c.kind === "competitor" ? "competitor" : "theme",
      found_by: had.found_by === c.found_by ? had.found_by : "both",
    });
  }
  const all = [...by.values()].sort((a, b) => b.seendate.localeCompare(a.seendate));
  // Keep room for competitor news, which is otherwise crowded out.
  const comp = all.filter((c) => c.kind === "competitor").slice(0, 15);
  const theme = all.filter((c) => c.kind === "theme").slice(0, max - comp.length);
  return [...theme, ...comp].sort((a, b) => b.seendate.localeCompare(a.seendate));
}

/** The ranker's picks joined to the candidates they number; invented numbers are dropped. */
export function parseRanked(text: string, cands: Candidate[]): Pick[] {
  const j = firstJson(text);
  const raw = Array.isArray(j?.picks) ? (j!.picks as Record<string, unknown>[]) : [];
  const used = new Set<number>();
  const out: Pick[] = [];
  for (const r of raw) {
    const n = Math.round(Number(r?.n));
    if (!Number.isFinite(n) || n < 1 || n > cands.length || used.has(n)) continue;
    used.add(n);
    const pr = clip(r?.pr_angle, 400);
    const geo = clip(r?.geo_angle, 400);
    if (!pr && !geo) continue;
    out.push({
      ...cands[n - 1],
      snippet: clip(r?.snippet, 300),
      pr_angle: pr,
      geo_angle: geo,
      relevance: Math.max(1, Math.min(5, Math.round(Number(r?.relevance) || 3))),
    });
  }
  return out;
}

/** Google News articles as candidates. */
export function fromGoogle(arts: Article[], kind: "theme" | "competitor", angle?: string): Candidate[] {
  return arts.map((a) => ({ ...a, kind, found_by: "google" as const, angle }));
}
