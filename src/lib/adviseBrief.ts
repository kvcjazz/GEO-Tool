import type { Brand, ContextItem, Response } from "./types";
import type { BrandData } from "@/state/AppState";
import { ctxString } from "./context";
import { factSheetText } from "./factSheet";
import { namesBrand, reachSplit } from "./questions";
import { gapSources, isTarget, KIND_LABELS } from "./sources";

// Everything the AI strategist should weigh when it suggests questions or
// tailors an action: the team's strategy and PR profile, what the client told
// us (strategy-call notes, with the team's steer), and what the latest
// measurement actually found. Sent to geo-advise as one "brief" so every AI
// recommendation is grounded in the same picture of the client.

export type AdviseBrief = {
  client: {
    name: string;
    aliases: string[];
    website: string | null;
    sector: string | null;
    market: string | null;
    /** ISO country the engines' web search is located in. */
    market_country: string | null;
    objective: string | null;
    positioning: string | null;
    audience: string | null;
    themes: string | null;
    buyer_persona: string | null;
    stage: string | null;
    pr_objectives: string | null;
    newsworthy: string | null;
  };
  competitors: { name: string; aliases: string[]; mentions_last_check: number | null }[];
  /** The team's confirmed facts about the client (ground truth). */
  fact_sheet: string;
  /** Strategy-call notes and uploaded documents, team-steered items first. */
  client_notes: string;
  questions: {
    text: string;
    type: string;
    active: boolean;
    names_client: boolean;
    /** Answers in the latest check that named the client, out of all answers. */
    named: number | null;
    answers: number | null;
    engines_naming_client: string[];
  }[];
  latest_check: null | {
    label: string | null;
    date: string | null;
    new_buyer_reach_pct: number;
    by_name_reach_pct: number;
    engine_mention_pct: Record<string, number>;
    /** Sites cited in answers that left the client out — where coverage is missing. */
    gap_sources: { domain: string; kind: string | null; citations: number }[];
  };
  recent_pr: {
    date: string;
    outlet: string;
    type: string | null;
    theme: string | null;
    tier: string | null;
    cited_by_ai: boolean;
  }[];
};

function steeredFirst(items: ContextItem[]): ContextItem[] {
  return [...items].sort((a, b) => Number(!!b.guidance) - Number(!!a.guidance));
}

function engineMentionPct(responses: Response[]): Record<string, number> {
  const by: Record<string, { n: number; named: number }> = {};
  for (const r of responses) {
    const e = (by[r.engine] ||= { n: 0, named: 0 });
    e.n++;
    if (r.mentioned) e.named++;
  }
  return Object.fromEntries(
    Object.entries(by).map(([k, v]) => [k, Math.round((v.named / v.n) * 100)]),
  );
}

export function buildAdviseBrief(brand: Brand, data: BrandData): AdviseBrief {
  const responses = data.responses;
  const byPrompt = new Map<string, Response[]>();
  for (const r of responses) {
    const list = byPrompt.get(r.prompt_id) || [];
    list.push(r);
    byPrompt.set(r.prompt_id, list);
  }
  const sovBy = new Map(data.sov.map((s) => [s.player.toLowerCase(), s.mentions]));
  const hasCheck = !!data.currentRun && responses.length > 0;
  const reach = hasCheck ? reachSplit(brand, data.prompts, responses) : null;

  return {
    client: {
      name: brand.name,
      aliases: brand.aliases || [],
      website: brand.website,
      sector: brand.sector,
      market: brand.pr_region,
      market_country: brand.market_country,
      objective: brand.objective,
      positioning: brand.positioning,
      audience: brand.audience,
      themes: brand.themes,
      buyer_persona: brand.pr_persona,
      stage: brand.pr_journey,
      pr_objectives: brand.pr_objectives,
      newsworthy: brand.pr_newsworthy,
    },
    competitors: data.competitors.map((c) => ({
      name: c.name,
      aliases: c.aliases || [],
      mentions_last_check: hasCheck ? (sovBy.get(c.name.toLowerCase()) ?? 0) : null,
    })),
    fact_sheet: factSheetText(brand.fact_sheet),
    client_notes: ctxString(steeredFirst(data.context), 12000),
    questions: data.prompts.map((p) => {
      const rows = byPrompt.get(p.id) || [];
      return {
        text: p.text,
        type: p.ptype,
        active: !!p.active,
        names_client: namesBrand(p.text, brand),
        named: rows.length ? rows.filter((r) => r.mentioned).length : null,
        answers: rows.length || null,
        engines_naming_client: [
          ...new Set(rows.filter((r) => r.mentioned).map((r) => r.engine)),
        ],
      };
    }),
    latest_check:
      hasCheck && reach
        ? {
            label: data.currentRun!.label,
            date: data.currentRun!.run_date,
            new_buyer_reach_pct: reach.newBuyers.pct,
            by_name_reach_pct: reach.byName.pct,
            engine_mention_pct: engineMentionPct(responses),
            gap_sources: gapSources(brand, responses)
              .filter((s) => isTarget(s.domain, data.sourceKinds))
              .slice(0, 20)
              .map((s) => ({
                domain: s.domain,
                kind: KIND_LABELS[data.sourceKinds[s.domain]?.kind || ""] || null,
                citations: s.count,
              })),
          }
        : null,
    recent_pr: [...data.pr]
      .sort((a, b) => (a.activity_date < b.activity_date ? 1 : -1))
      .slice(0, 15)
      .map((p) => ({
        date: p.activity_date,
        outlet: p.outlet,
        type: p.atype,
        theme: p.theme,
        tier: p.tier,
        cited_by_ai: !!p.cited,
      })),
  };
}
