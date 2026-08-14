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
import type { Brand, Response } from "./types";

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
  responses: Response[],
  eng: string,
): EngineMetrics | null {
  const rows = responses.filter((r) => r.engine === eng);
  if (!rows.length) return null;
  const mention = avg(rows.map((r) => (r.mentioned ? 1 : 0))) * 100;
  const bM = sum(rows.map((r) => (r.mentioned ? 1 : 0)));
  const cM = sum(rows.map((r) => r.competitor_mentions || 0));
  const sov = bM + cM ? (bM / (bM + cM)) * 100 : 0;
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

export function computeAll(brand: Brand, responses: Response[]): {
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

export function brandMentionsTotal(responses: Response[]): number {
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
