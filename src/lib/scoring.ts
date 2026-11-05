// Scoring engine — ported EXACTLY from computeAll()/engineMetrics()/geoSub()
// in the prototype. This is the credibility core; behaviour must match.

import {
  ACC,
  DEFAULT_ENGINE_WEIGHTS,
  DEFAULT_METRIC_WEIGHTS,
  ENGINES,
  PROM,
  SENT,
  type MetricWeights,
} from "./constants";
import { avg, sum } from "./format";
import type { Brand, Competitor, Response } from "./types";

/** The response fields the score is computed from. */
export type Scorable = Pick<
  Response,
  "engine" | "mentioned" | "competitor_mentions" | "cited" | "prominence" | "sentiment" | "accuracy"
> & { entities?: Response["entities"] };

/** Columns to select when only scoring a run (keeps answers and raw out). */
export const SCORE_COLUMNS =
  "run_id,engine,mentioned,competitor_mentions,cited,prominence,sentiment,accuracy,entities";

// ---- Share of voice v2 ------------------------------------------------------
// Counts every brand the AI answers name (geo_responses.entities), not only the
// tracked competitors, on questions that don't name the client (where buyers
// discover brands). A brand the answer recommends scores 2, any other mention
// 1, averaged over the samples of each answer. Share of voice is the client's
// points as a share of all brands' points. Answers measured before brand
// extraction fall back to the original formula (tracked competitors only).

type EntityList = { name: string; recommended?: boolean; client?: boolean }[];
type EntitiesJson = { v?: number; branded?: boolean; samples?: EntityList[] };

export const RECOMMENDED_POINTS = 2;
export const MENTION_POINTS = 1;

function entitiesOf(r: { entities?: unknown }): EntitiesJson | null {
  const e = r.entities as EntitiesJson | null | undefined;
  return e && Array.isArray(e.samples) ? e : null;
}

/** One key per brand across spelling variants ("Lemonade Inc." ≈ "lemonade"). */
export function brandKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(inc|ltd|llc|plc|limited|corp|corporation|gmbh)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CLIENT = "__client__";

/** Average points per brand in one answer (over its samples). */
function answerPoints(e: EntitiesJson): Map<string, { name: string; pts: number; rec: boolean }> {
  const out = new Map<string, { name: string; pts: number; rec: boolean }>();
  const samples = e.samples || [];
  if (!samples.length) return out;
  for (const list of samples) {
    const seen = new Set<string>();
    for (const b of list || []) {
      const key = b.client ? CLIENT : brandKey(b.name || "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const cur = out.get(key) || { name: b.name, pts: 0, rec: false };
      cur.pts += (b.recommended ? RECOMMENDED_POINTS : MENTION_POINTS) / samples.length;
      cur.rec = cur.rec || !!b.recommended;
      out.set(key, cur);
    }
  }
  return out;
}

/**
 * Client share of voice (0–100) over answers with brand data, on questions
 * that don't name the client (branded = false) or that do (branded = true).
 * Null when none of the answers has brand data.
 */
export function shareOfVoice(rows: { entities?: unknown }[], branded = false): number | null {
  let client = 0;
  let total = 0;
  let any = false;
  for (const r of rows) {
    const e = entitiesOf(r);
    if (!e || !!e.branded !== branded) continue;
    any = true;
    for (const [k, v] of answerPoints(e)) {
      total += v.pts;
      if (k === CLIENT) client += v.pts;
    }
  }
  if (!any) return null;
  return total ? (client / total) * 100 : 0;
}

export type CategoryBrand = {
  key: string;
  name: string;
  client: boolean;
  points: number;
  /** Share of all brands' points, 0–100. */
  share: number;
  /** Answers naming it. */
  answers: number;
  /** Answers recommending it. */
  recommended: number;
  engines: string[];
};

/** Every brand the engines name on unbranded questions, biggest share first. */
export function categoryBrands(
  rows: { entities?: unknown; engine: string }[],
  clientName: string,
): CategoryBrand[] {
  const by = new Map<string, CategoryBrand & { names: Map<string, number>; eng: Set<string> }>();
  let total = 0;
  for (const r of rows) {
    const e = entitiesOf(r);
    if (!e || e.branded) continue;
    for (const [k, v] of answerPoints(e)) {
      total += v.pts;
      const cur =
        by.get(k) ||
        ({
          key: k,
          name: k === CLIENT ? clientName : v.name,
          client: k === CLIENT,
          points: 0,
          share: 0,
          answers: 0,
          recommended: 0,
          engines: [],
          names: new Map(),
          eng: new Set(),
        } as CategoryBrand & { names: Map<string, number>; eng: Set<string> });
      cur.points += v.pts;
      cur.answers += 1;
      if (v.rec) cur.recommended += 1;
      cur.eng.add(r.engine);
      cur.names.set(v.name, (cur.names.get(v.name) || 0) + 1);
      by.set(k, cur);
    }
  }
  return [...by.values()]
    .map((b) => ({
      key: b.key,
      // The most common spelling.
      name: b.client ? clientName : [...b.names.entries()].sort((x, y) => y[1] - x[1])[0][0],
      client: b.client,
      points: b.points,
      share: total ? (b.points / total) * 100 : 0,
      answers: b.answers,
      recommended: b.recommended,
      engines: [...b.eng],
    }))
    .sort((a, b) => b.points - a.points);
}

/** Answers in the list still waiting for brand extraction. */
export function missingEntities(rows: { entities?: unknown }[]): number {
  return rows.filter((r) => !entitiesOf(r)).length;
}

export function metricWeights(brand: Brand): MetricWeights {
  const w = (brand.metric_weights || {}) as Record<string, unknown>;
  // Fall back to the product defaults if a brand has no weights stored yet
  // (new clients rely on the DB column default).
  if (w.mention == null && w.sov == null) return { ...DEFAULT_METRIC_WEIGHTS };
  return {
    mention: +(w.mention as number) || 0,
    sov: +(w.sov as number) || 0,
    citation: +(w.citation as number) || 0,
    position: +(w.position as number) || 0,
    sentiment: +(w.sentiment as number) || 0,
    accuracy: +(w.accuracy as number) || 0,
  };
}

export function engineWeights(brand: Brand): Record<string, number> {
  const w = (brand.engine_weights || {}) as Record<string, number>;
  if (!w || Object.keys(w).length === 0) return { ...DEFAULT_ENGINE_WEIGHTS };
  return w;
}

export type EngineMetrics = {
  mention: number;
  sov: number;
  citation: number;
  position: number;
  sentiment: number;
  accuracy: number;
};

export function engineMetrics(
  responses: Scorable[],
  eng: string,
): EngineMetrics | null {
  const rows = responses.filter((r) => r.engine === eng);
  if (!rows.length) return null;
  const mention = avg(rows.map((r) => (r.mentioned ? 1 : 0))) * 100;
  const bM = sum(rows.map((r) => (r.mentioned ? 1 : 0)));
  const cM = sum(rows.map((r) => r.competitor_mentions || 0));
  // v2 (every brand named, unbranded questions, prominence-weighted) when the
  // answers have brand data; otherwise the original tracked-competitor ratio.
  const sov = shareOfVoice(rows) ?? (bM + cM ? (bM / (bM + cM)) * 100 : 0);
  const cr = rows.filter((r) => r.cited === "Yes" || r.cited === "No");
  const citation = cr.length
    ? avg(cr.map((r) => (r.cited === "Yes" ? 100 : 0)))
    : 0;
  const position = avg(rows.map((r) => PROM[r.prominence as string] ?? 0));
  const mr = rows.filter((r) => r.mentioned);
  const sentiment = mr.length
    ? avg(mr.map((r) => SENT[r.sentiment as string] ?? 0))
    : 0;
  const accuracy = mr.length
    ? avg(mr.map((r) => ACC[r.accuracy as string] ?? 0))
    : 0;
  return { mention, sov, citation, position, sentiment, accuracy };
}

export function geoSub(m: EngineMetrics, w: MetricWeights): number {
  return (
    (m.mention * w.mention +
      m.sov * w.sov +
      m.citation * w.citation +
      m.position * w.position +
      m.sentiment * w.sentiment +
      m.accuracy * w.accuracy) /
    100
  );
}

export type PerEngine = EngineMetrics & { engine: string; geo: number };
export type Blended = EngineMetrics & { geo: number };

export function computeAll(brand: Brand, responses: Scorable[]): {
  perEngine: PerEngine[];
  blended: Blended;
} {
  const w = engineWeights(brand);
  const mw = metricWeights(brand);
  let wsum = 0;
  const acc = {
    mention: 0,
    sov: 0,
    citation: 0,
    position: 0,
    sentiment: 0,
    accuracy: 0,
    geo: 0,
  };
  const perEngine: PerEngine[] = [];
  ENGINES.forEach((e) => {
    const m = engineMetrics(responses, e);
    if (!m) return;
    const g = geoSub(m, mw);
    const wt = +(w[e] || 0);
    perEngine.push({ engine: e, ...m, geo: g });
    wsum += wt;
    (["mention", "sov", "citation", "position", "sentiment", "accuracy"] as const).forEach(
      (k) => (acc[k] += m[k] * wt),
    );
    acc.geo += g * wt;
  });
  const blended = {} as Blended;
  (Object.keys(acc) as (keyof typeof acc)[]).forEach(
    (k) => (blended[k] = wsum ? acc[k] / wsum : 0),
  );
  return { perEngine, blended };
}

export function brandMentionsTotal(responses: Scorable[]): number {
  return sum(responses.map((r) => (r.mentioned ? 1 : 0)));
}

export function confLabel(responses: Response[]): {
  label: string;
  color: string;
  covered: number;
  total: number;
} | null {
  const rs = responses.filter((r) => r.confidence);
  if (!rs.length) return null;
  const n: Record<string, number> = { High: 0, Medium: 0, Low: 0 };
  rs.forEach((r) => {
    n[r.confidence as string] = (n[r.confidence as string] || 0) + 1;
  });
  const frac = n.High / rs.length;
  const label = frac >= 0.6 ? "High" : n.Low > rs.length * 0.4 ? "Low" : "Medium";
  const color =
    label === "High" ? "#7fe0aa" : label === "Low" ? "#f0a3a3" : "#f0d090";
  return { label, color, covered: rs.length, total: responses.length };
}

export function prAttribution(responses: Response[]): {
  cited: number;
  attr: number;
  pct: number;
} {
  const citedRows = responses.filter((r) => r.cited === "Yes");
  const attr = citedRows.filter((r) => r.cited_pr_id);
  return {
    cited: citedRows.length,
    attr: attr.length,
    pct: citedRows.length ? Math.round((attr.length / citedRows.length) * 100) : 0,
  };
}

/**
 * Share-of-voice counts for a v2 run, from each response's per-sample detail: a
 * competitor counts once per prompt × engine when it was named in at least half
 * the samples — the same rule as the brand's own "mentioned".
 */
export function sovFromSamples(
  responses: Response[],
  competitors: Competitor[],
): { player: string; mentions: number }[] {
  return competitors.map((c) => ({
    player: c.name,
    mentions: responses.filter((r) => {
      const samples = (Array.isArray(r.raw) ? r.raw : []) as { competitors?: string[] }[];
      if (!samples.length) return false;
      const named = samples.filter((s) => (s.competitors || []).includes(c.name)).length;
      return named / samples.length >= 0.5;
    }).length,
  }));
}
