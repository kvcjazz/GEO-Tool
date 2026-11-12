// Breaking-news radar for a client (PR Planning → news panels).
//
// Uses the client's profile to decide what news to look for, searches Google
// News RSS and Claude web search for the last 14 days, then keeps the stories
// the team could use and says, for each, what it says (snippet), how to use it
// for PR and why it matters for GEO. Every AI step runs on Claude Haiku (see
// _shared/newsradar.ts for the steps and how links and dates are checked).
//
// Without an Anthropic key, or if the AI fails, it still returns Google News
// for the client's short themes and says why (`source: "google"`, `note`).
import { callAnalyst, callModel, CORS, countryCode, envKey, json } from "../_shared/providers.ts";
import { signedIn } from "../_shared/auth.ts";
import { competitorNews, googleNews, orQuery, searchTerms } from "../_shared/news.ts";
import {
  type Angle,
  type Candidate,
  type ClientProfile,
  fromGoogle,
  type GeoEvidence,
  mergeCandidates,
  NEWS_MODEL,
  parseAngles,
  parseFound,
  parseRanked,
  type Pick,
  planPrompt,
  rankPrompt,
  searchPrompt,
} from "../_shared/newsradar.ts";

type Brief = GeoEvidence & {
  client?: Partial<ClientProfile> & { name?: string; aliases?: string[] };
  fact_sheet?: string;
  client_notes?: string;
  competitors?: { name: string }[];
};

type Body = {
  /** The client, used only to label AI spend (geo_ai_usage). */
  brand_id?: string | null;
  /** The app's client brief (src/lib/adviseBrief.ts). Older apps send only the fields below. */
  brief?: Brief;
  brand?: string;
  themes?: string | null;
  sector?: string | null;
  pr_region?: string | null;
  market_country?: string | null;
  competitors?: string[];
  mediaTargets?: { outlet: string }[];
};

function profileOf(b: Body): ClientProfile {
  const c = b.brief?.client || {};
  const comps = (b.competitors?.length ? b.competitors : (b.brief?.competitors || []).map((x) => x.name))
    .filter(Boolean);
  return {
    name: c.name || b.brand || "",
    website: c.website,
    sector: c.sector ?? b.sector,
    market: c.market ?? b.pr_region,
    market_country: c.market_country ?? b.market_country,
    objective: c.objective,
    positioning: c.positioning,
    audience: c.audience,
    themes: c.themes ?? b.themes,
    buyer_persona: c.buyer_persona,
    stage: c.stage,
    pr_objectives: c.pr_objectives,
    newsworthy: c.newsworthy,
    competitors: comps,
    media_targets: (b.mediaTargets || []).map((m) => m.outlet).filter(Boolean),
    fact_sheet: b.brief?.fact_sheet,
    client_notes: b.brief?.client_notes,
  };
}

/** Search angles without AI: the client's short themes, else its sector. */
function plainAngles(p: ClientProfile): Angle[] {
  const terms = searchTerms(p.themes);
  const use = terms.length ? terms : searchTerms(p.sector);
  return use.slice(0, 5).map((t) => ({ topic: t, query: t, why: "" }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await signedIn(req))) return json({ error: "Sign-in required." }, 401);
  const b = (await req.json().catch(() => ({}))) as Body;
  const p = profileOf(b);
  if (!p.name) return json({ error: "No client given." }, 400);
  const country = countryCode(p.market_country);
  const now = new Date();
  const key = envKey("anthropic");
  const usage = (purpose: string) => ({ fn: "geo-news", purpose, brandId: b.brand_id });
  const notes: string[] = [];

  // 1. Plan: which stories to look for.
  let angles: Angle[] = [];
  if (key) {
    const plan = await callModel("anthropic", key, planPrompt(p, b.brief, now), 4000, {
      models: [NEWS_MODEL],
      usage: usage("news-plan"),
    });
    angles = parseAngles(plan.text);
    if (!angles.length) notes.push("planning: " + (plan.error || "the AI reply could not be read"));
  } else {
    notes.push("no Anthropic key: searched the client's themes without AI");
  }
  if (!angles.length) angles = plainAngles(p);

  // 2. Search: Google News per angle, the client's own name, its competitors,
  //    and Claude web search across the same angles — all at once.
  const brandQuery = orQuery([p.name, ...((b.brief?.client?.aliases as string[]) || [])], 3);
  const [byAngle, own, comp, ai] = await Promise.all([
    Promise.all(angles.map((a) => googleNews(a.query, { country, max: 8 }))),
    googleNews(brandQuery, { country, max: 8 }),
    competitorNews(p.competitors, country),
    key
      ? callModel("anthropic", key, searchPrompt(p, angles, now), 8000, {
        models: [NEWS_MODEL],
        webSearch: true,
        searchRequired: true,
        maxSearches: 5,
        country,
        usage: usage("news-search"),
      })
      : Promise.resolve(null),
  ]);
  const googleErrors = [...byAngle, own, comp].map((r) => r.error).filter(Boolean);
  if (googleErrors.length) notes.push("Google News: " + googleErrors[0]);
  let aiFound: Candidate[] = [];
  if (ai) {
    if (ai.error) notes.push("AI search: " + ai.error);
    else aiFound = parseFound(ai.text, ai.sources || [], now);
  }
  const cands = mergeCandidates(
    [
      ...byAngle.map((r, i) => fromGoogle(r.articles, "theme", angles[i].topic)),
      fromGoogle(own.articles, "theme", p.name),
      fromGoogle(comp.articles, "competitor", "Competitors"),
      aiFound,
    ],
    now,
  );

  const base = {
    angles,
    query: angles.map((a) => a.query).join(" | "),
    candidates: cands.length,
    found: {
      google: cands.filter((c) => c.found_by !== "ai").length,
      ai_search: cands.filter((c) => c.found_by !== "google").length,
    },
  };
  if (!cands.length) {
    return json({
      ...base,
      articles: [],
      competitorNews: [],
      source: "none",
      note: notes.join(" · ") || undefined,
      error: googleErrors[0] || (ai?.error ? "AI search: " + ai.error : undefined),
    });
  }

  // 3. Rank and explain. Haiku first; the usual analyst chain if it fails.
  const prompt = rankPrompt(p, b.brief, cands, now);
  let picks: Pick[] = [];
  let model = "";
  if (key) {
    const r = await callModel("anthropic", key, prompt, 8000, { models: [NEWS_MODEL], usage: usage("news-rank") });
    picks = parseRanked(r.text, cands);
    model = r.model;
    if (!picks.length) notes.push("ranking: " + (r.error || "the AI reply could not be read"));
  }
  if (!picks.length) {
    const r = await callAnalyst(prompt, 8000, usage("news-rank"));
    picks = parseRanked(r.text, cands);
    model = r.model;
    if (!picks.length && r.error) notes.push("ranking fallback: " + r.error);
  }

  if (!picks.length) {
    // Nothing explained: show the raw headlines rather than nothing.
    return json({
      ...base,
      articles: cands.filter((c) => c.kind === "theme").slice(0, 12),
      competitorNews: cands.filter((c) => c.kind === "competitor").slice(0, 8),
      source: "google",
      note: notes.join(" · "),
    });
  }
  return json({
    ...base,
    articles: picks.filter((x) => x.kind === "theme"),
    competitorNews: picks.filter((x) => x.kind === "competitor"),
    source: "ai",
    model,
    note: notes.join(" · ") || undefined,
  });
});
