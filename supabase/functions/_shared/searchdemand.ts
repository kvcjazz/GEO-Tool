// Search demand — the SEO input to "suggest questions from search demand".
// Mirrors the BriefSearchTerm shape in src/lib/searchDemand.ts — keep in step.
//
// SEO data says what people type into Google. It is used only to choose which
// questions to ask the AI engines; it is never evidence of AI visibility, and
// the prompt says so, so the model never treats a Google ranking as a GEO result.

export type SearchDemandTerm = {
  query: string;
  demand: number | null;
  demand_kind: "volume" | "impressions" | null;
  clicks: number | null;
  google_position: number | null;
  question_style: boolean;
  already_tracked: boolean;
};

/** Same normalisation the app stores terms with. */
export function normQuery(q: string): string {
  return String(q ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return v == null || v === "" || !Number.isFinite(n) ? null : n;
};

/** Validates the caller's list: known fields only, at most `max` terms. */
export function cleanSearchDemand(raw: unknown, max = 120): SearchDemandTerm[] {
  if (!Array.isArray(raw)) return [];
  const out: SearchDemandTerm[] = [];
  const seen = new Set<string>();
  for (const r of raw as Record<string, unknown>[]) {
    const query = normQuery(String(r?.query ?? "")).slice(0, 300);
    if (!query || seen.has(query)) continue;
    seen.add(query);
    const kind = r.demand_kind === "volume" || r.demand_kind === "impressions" ? r.demand_kind : null;
    out.push({
      query,
      demand: num(r.demand),
      demand_kind: kind,
      clicks: num(r.clicks),
      google_position: num(r.google_position),
      question_style: !!r.question_style,
      already_tracked: !!r.already_tracked,
    });
    if (out.length >= max) break;
  }
  return out;
}

/** The SEARCH DEMAND section of the strategist prompt. */
export function renderSearchDemand(terms: SearchDemandTerm[]): string {
  return (
    "SEARCH DEMAND — SEO data, NOT AI visibility. These are terms people type into Google, " +
    "imported by the team from the client's Google Search Console or a keyword tool. " +
    "demand = monthly Google searches (demand_kind \"volume\") or the client's Google " +
    "impressions (\"impressions\"); google_position = where the client's site ranks in Google " +
    "for the term, if known; already_tracked = a tracked question was already drafted from it. " +
    "This shows what people want to know. It says nothing about whether AI assistants name " +
    "the client — that is measured separately, by asking the engines.\n" +
    JSON.stringify(terms)
  );
}

/**
 * Matches the model's `seo_seed` back to a term the team actually imported.
 * Returns null when the model named a term that isn't in the list, so an SEO
 * label is only ever shown for real search data.
 */
export function matchSeed(
  seed: unknown,
  terms: SearchDemandTerm[],
): SearchDemandTerm | null {
  const k = normQuery(String(seed ?? "").replace(/^["'“”]+|["'“”]+$/g, ""));
  if (!k) return null;
  return terms.find((t) => t.query === k) || null;
}
