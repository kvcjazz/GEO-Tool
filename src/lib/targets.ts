import { domainOf, isOwnSite } from "./sources";
import { engineWeights } from "./scoring";
import type { Brand, MediaTarget, Prompt, SourceKind, TargetTitle } from "./types";

// Titles to target: which sites the engines actually cite for a client, ranked
// by how much they matter to its strategy. The ranking here is deterministic;
// the senior-PR judgement of what is winnable comes from geo-targets.

/** One cited answer, reduced to what the ranking needs. */
export type CitedAnswer = {
  run_id: string;
  prompt_id: string;
  engine: string;
  mentioned: boolean;
  competitor_mentions: number;
  domains: string[];
  urls: string[];
};

/** A site to put in front of the senior-PR review. */
export type Candidate = {
  key: string;
  domain: string | null;
  name: string | null;
  score: number;
  citations: number;
  gap_citations: number;
  engines: string[];
  questions: number;
  question_types: string[];
  example_urls: string[];
  on_list: boolean;
  tier: string | null;
  vip: boolean;
  team_decision: string | null;
  team_note: string | null;
  kind_hint: string | null;
};

/**
 * Buyer questions count for more than "what is X" questions: they are the
 * answers that send people to a supplier.
 */
const TYPE_WEIGHT: Record<string, number> = {
  "Buying-intent": 1.5,
  Comparison: 1.4,
  "Problem-led": 1.2,
  Category: 1,
  "Brand/Entity": 0.7,
};

/** What geo-targets reviews in one call (it caps the list at 35). */
export const MAX_CANDIDATES = 35;

/** Questions the first-look probe asks: the buyer questions first. */
export function probeQuestions(prompts: Prompt[], max = 6): Prompt[] {
  return prompts
    .filter((p) => p.active && p.text.trim())
    .sort((a, b) => (TYPE_WEIGHT[b.ptype || ""] || 1) - (TYPE_WEIGHT[a.ptype || ""] || 1))
    .slice(0, max);
}

/** The citation URLs saved with a v2 answer (one list per sample). */
export function rawUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) =>
    Array.isArray((r as { citations?: unknown })?.citations)
      ? ((r as { citations: unknown[] }).citations.filter((u) => typeof u === "string") as string[])
      : [],
  );
}

/** Domains in a cited_sources string. */
export function splitDomains(s: string | null | undefined): string[] {
  return [...new Set(String(s || "").split(/[,;]/).map(domainOf).filter(Boolean))];
}

/** Loose match between a media-list outlet name and a site ("The Drum" ≈ thedrum.com). */
export function outletMatches(outlet: string, domain: string): boolean {
  const t = outlet.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");
  if (!t) return false;
  // Short names ("FT", "BBC") only match the site's own name, not any substring.
  if (t === domain.split(".")[0].replace(/[^a-z0-9]/g, "")) return true;
  const d = domain.replace(/[^a-z0-9]/g, "");
  return t.length >= 4 && d.indexOf(t.slice(0, Math.min(t.length, 8))) >= 0;
}

export function buildCandidates(opts: {
  brand: Brand;
  answers: CitedAnswer[];
  prompts: Prompt[];
  media: MediaTarget[];
  kinds: Record<string, SourceKind>;
  existing: TargetTitle[];
}): Candidate[] {
  const { brand, answers, prompts, media, kinds, existing } = opts;
  const ptype = new Map(prompts.map((p) => [p.id, p.ptype || ""]));
  const ew = engineWeights(brand);
  const ewMean = Object.values(ew).reduce((a, b) => a + (+b || 0), 0) / (Object.keys(ew).length || 1);
  const team = new Map(existing.map((t) => [t.key, t]));

  type Acc = {
    score: number;
    citations: number;
    gap: number;
    engines: Set<string>;
    questions: Set<string>;
    types: Set<string>;
    runs: Set<string>;
    urls: string[];
  };
  const acc: Record<string, Acc> = {};
  for (const a of answers) {
    const typeW = TYPE_WEIGHT[ptype.get(a.prompt_id) || ""] || 1;
    const engW = Math.max(0.3, (+ew[a.engine] || 0) / (ewMean || 1));
    // Answers that name a competitor but not the client are where it is losing.
    const gap = !a.mentioned && a.competitor_mentions > 0;
    for (const d of a.domains) {
      if (isOwnSite(d, brand) || kinds[d]?.kind === "competitor") continue;
      const s = (acc[d] ||= {
        score: 0,
        citations: 0,
        gap: 0,
        engines: new Set(),
        questions: new Set(),
        types: new Set(),
        runs: new Set(),
        urls: [],
      });
      s.score += typeW * engW * (gap ? 1.5 : 1);
      s.citations++;
      if (gap) s.gap++;
      s.engines.add(a.engine);
      s.questions.add(a.prompt_id);
      const t = ptype.get(a.prompt_id);
      if (t) s.types.add(t);
      s.runs.add(a.run_id);
      for (const u of a.urls) {
        if (s.urls.length < 3 && domainOf(u) === d && !s.urls.includes(u)) s.urls.push(u);
      }
    }
  }

  const onList = (d: string) => media.find((m) => outletMatches(m.outlet || "", d)) || null;
  const cited: Candidate[] = Object.entries(acc).map(([d, s]) => {
    const m = onList(d);
    const t = team.get(d);
    return {
      key: d,
      domain: d,
      name: m?.outlet || (t?.name && t.name !== d ? t.name : null),
      // Being cited across several checks and engines is what "regularly sourced" means.
      score: s.score * (1 + 0.15 * (s.runs.size - 1)) * (1 + 0.1 * (s.engines.size - 1)),
      citations: s.citations,
      gap_citations: s.gap,
      engines: [...s.engines],
      questions: s.questions.size,
      question_types: [...s.types],
      example_urls: s.urls,
      on_list: !!m,
      tier: m?.tier || null,
      vip: !!m?.vip,
      team_decision: t?.team_decision || null,
      team_note: t?.team_note || null,
      kind_hint: kinds[d]?.label || null,
    };
  });
  cited.sort((a, b) => b.score - a.score);

  // Media-list titles the engines don't cite yet are still judged, so the team
  // sees whether they are worth the effort — but they don't crowd out cited ones.
  const citedKeys = new Set(cited.map((c) => c.key));
  const uncitedList: Candidate[] = media
    .filter((m) => m.outlet && !cited.some((c) => c.on_list && c.name === m.outlet))
    .slice(0, 8)
    .map((m) => {
      const key = m.outlet.trim().toLowerCase();
      const t = team.get(key);
      return {
        key,
        domain: null,
        name: m.outlet,
        score: 0,
        citations: 0,
        gap_citations: 0,
        engines: [],
        questions: 0,
        question_types: [],
        example_urls: [],
        on_list: true,
        tier: m.tier,
        vip: m.vip,
        team_decision: t?.team_decision || null,
        team_note: t?.team_note || null,
        kind_hint: null,
      };
    })
    .filter((c) => !citedKeys.has(c.key));

  // Sites the team has a relationship with stay in view even when cited less.
  const room = MAX_CANDIDATES - uncitedList.length;
  const top = cited.slice(0, room);
  const kept = cited
    .slice(room)
    .filter((c) => c.team_decision === "relationship")
    .slice(0, 5);
  return [...top.slice(0, room - kept.length), ...kept, ...uncitedList];
}

/** The latest review's rows, best targets first. */
export function latestTargets(rows: TargetTitle[]): {
  batch: string | null;
  at: string | null;
  story: string | null;
  basis: string | null;
  rows: TargetTitle[];
} {
  const newest = [...rows]
    .filter((r) => r.batch_id)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  if (!newest) return { batch: null, at: null, story: null, basis: null, rows: [] };
  const order: Record<string, number> = { realistic: 0, stretch: 1, not_realistic: 2 };
  const current = rows
    .filter((r) => r.batch_id === newest.batch_id)
    .sort(
      (a, b) =>
        (order[a.verdict || ""] ?? 3) - (order[b.verdict || ""] ?? 3) ||
        (b.priority || 0) - (a.priority || 0) ||
        b.citations - a.citations,
    );
  return {
    batch: newest.batch_id,
    at: newest.updated_at,
    story: newest.story,
    basis: newest.basis,
    rows: current,
  };
}

export const TARGET_KIND_LABELS: Record<string, string> = {
  national: "National",
  trade: "Trade",
  regional: "Regional",
  broadcast: "Broadcast",
  podcast: "Podcast",
  blog: "Blog",
  review: "Review site",
  directory: "Directory / ranking",
  community: "Community",
  analyst: "Analyst",
  reference: "Reference",
  academic: "Academic",
  competitor: "Competitor",
  other: "Other",
};
