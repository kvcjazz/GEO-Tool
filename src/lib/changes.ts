// "What changed since the last check" and "what needs attention", shared by
// the Overview and the monthly Report so both say the same thing.

import { namesBrand } from "./questions";
import type { V2Answer } from "./prImpact";
import type { Brand, Prompt, Response, Run } from "./types";

/**
 * The most recent earlier check measured the same way as `run` and with
 * answers loaded — what every "vs last check" figure compares against.
 */
export function previousCheck(
  run: Run,
  runs: Run[],
  history: Record<string, unknown[]>,
): Run | null {
  const sameMethod = (r: Run) => (r.method ?? null) === (run.method ?? null);
  return (
    [...runs]
      .filter((r) => sameMethod(r) && r.id !== run.id && history[r.id]?.length)
      .sort((a, b) => a.run_date.localeCompare(b.run_date) || a.created_at.localeCompare(b.created_at))
      .filter((r) => r.run_date <= run.run_date)
      .pop() || null
  );
}

const pct = (n: number, d: number): number => (d ? Math.round((n / d) * 100) : 0);

export type CheckComparison = {
  /** Reach on the same question × engine pairs in the previous check. */
  prevReach: { newBuyers: number; byName: number } | null;
  /** Questions now named by more engines than last time. */
  gained: { id: string; text: string }[];
  /** Questions now named by fewer engines than last time. */
  lost: { id: string; text: string }[];
};

/** Like-for-like comparison with the previous check (same question × engine). */
export function compareChecks(
  brand: Brand,
  run: Run,
  prevRun: Run | null,
  answers: V2Answer[] | null,
  prompts: Prompt[],
): CheckComparison {
  const out: CheckComparison = { prevReach: null, gained: [], lost: [] };
  if (!answers || !prevRun) return out;
  const key = (a: { prompt_id: string; engine: string }) => a.prompt_id + "|" + a.engine;
  const cur = new Map(answers.filter((a) => a.run_id === run.id).map((a) => [key(a), a]));
  const prev = new Map(answers.filter((a) => a.run_id === prevRun.id).map((a) => [key(a), a]));
  const both = [...cur.keys()].filter((k) => prev.has(k));
  const branded = new Map(prompts.map((p) => [p.id, namesBrand(p.text, brand)]));
  const rateOf = (m: Map<string, V2Answer>, wantBranded: boolean) => {
    const rows = both.map((k) => m.get(k)!).filter((a) => (branded.get(a.prompt_id) ?? false) === wantBranded);
    return { named: rows.filter((a) => a.mentioned).length, n: rows.length };
  };
  const nbPrev = rateOf(prev, false);
  const bnPrev = rateOf(prev, true);
  if (both.length) out.prevReach = { newBuyers: pct(nbPrev.named, nbPrev.n), byName: pct(bnPrev.named, bnPrev.n) };
  const byQ = (m: Map<string, V2Answer>) => {
    const counts = new Map<string, number>();
    for (const k of both) {
      const a = m.get(k)!;
      counts.set(a.prompt_id, (counts.get(a.prompt_id) || 0) + (a.mentioned ? 1 : 0));
    }
    return counts;
  };
  const qc = byQ(cur);
  const qp = byQ(prev);
  const text = new Map(prompts.map((p) => [p.id, p.text]));
  for (const q of qc.keys()) {
    const c = qc.get(q) || 0;
    const p = qp.get(q) || 0;
    if (c > p) out.gained.push({ id: q, text: text.get(q) || "" });
    if (c < p) out.lost.push({ id: q, text: text.get(q) || "" });
  }
  return out;
}

/** Brand names an answer names, other than the client (from brand data or tracked competitors). */
function othersNamed(r: Response): boolean {
  const e = r.entities as { samples?: { client?: boolean }[][] } | null;
  if (e?.samples?.length) return e.samples.some((s) => s.some((b) => !b.client));
  return (r.competitor_mentions || 0) > 0;
}

export type Attention = {
  /** Answers stating something wrong about the client, major errors first. */
  errors: Response[];
  /** Answers that are negative about the client. */
  negative: Response[];
  /** Unbranded questions where other brands are named but the client isn't, by any engine. */
  missedToOthers: { id: string; text: string; engines: number }[];
};

/** What in the current check most needs the team's attention. */
export function needsAttention(brand: Brand, responses: Response[], prompts: Prompt[]): Attention {
  const errors = responses
    .filter((r) => r.mentioned && (r.accuracy === "Major error" || r.accuracy === "Minor error"))
    .sort((a, b) => (a.accuracy === "Major error" ? 0 : 1) - (b.accuracy === "Major error" ? 0 : 1));
  const negative = responses.filter((r) => r.mentioned && r.sentiment === "Negative");
  const byQ = new Map<string, { mentioned: number; others: number }>();
  for (const r of responses) {
    const g = byQ.get(r.prompt_id) || { mentioned: 0, others: 0 };
    if (r.mentioned) g.mentioned++;
    else if (othersNamed(r)) g.others++;
    byQ.set(r.prompt_id, g);
  }
  const missedToOthers = prompts
    .filter((p) => p.active && !namesBrand(p.text, brand))
    .map((p) => ({ id: p.id, text: p.text, g: byQ.get(p.id) }))
    .filter((x) => x.g && x.g.mentioned === 0 && x.g.others > 0)
    .map((x) => ({ id: x.id, text: x.text, engines: x.g!.others }))
    .sort((a, b) => b.engines - a.engines);
  return { errors, negative, missedToOthers };
}
