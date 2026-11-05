import { ENGINES, METRIC_KEYS, type MetricWeights } from "./constants";
import { r1 } from "./format";
import type { PerEngine } from "./scoring";

// Plain-English explanation for the "GEO score by engine" chart: what the bars
// are, and why they differ, worked out from the same numbers the chart shows.
// No AI call, so it is instant and can never disagree with the chart.

type Metric = (typeof METRIC_KEYS)[number];

/** Below this many answers an engine's score can swing a lot between checks. */
export const FEW_ANSWERS = 10;
/** Engines within this many points of each other are treated as level. */
const LEVEL_SPREAD = 5;

function describe(k: Metric, v: number, name: string): string {
  const n = Math.round(v);
  switch (k) {
    case "mention":
      return `named ${name} in ${n}% of its answers`;
    case "sov":
      return `gave ${name} ${n}% of the brand mentions in its answers`;
    case "citation":
      return `cited ${name}'s own website in ${n}% of answers`;
    case "position":
      return `placed ${name} prominently (prominence ${n}/100)`;
    case "sentiment":
      return `described ${name} with sentiment of ${n}/100`;
    case "accuracy":
      return `got the facts about ${name} right (accuracy ${n}/100)`;
  }
}

const PCT: Metric[] = ["mention", "sov", "citation"];
const unit = (k: Metric) => (PCT.includes(k) ? "%" : "/100");
const list = (a: string[]) =>
  a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * The metric that most explains an engine's score versus the other engines:
 * the biggest gap from their average, weighted by how much that metric counts
 * in the score.
 */
function driver(
  e: PerEngine,
  others: PerEngine[],
  w: MetricWeights,
  dir: 1 | -1,
): { k: Metric; v: number; avg: number } | null {
  let best: { k: Metric; v: number; avg: number; d: number } | null = null;
  for (const k of METRIC_KEYS) {
    if (!w[k]) continue;
    const avg = others.reduce((s, o) => s + o[k], 0) / others.length;
    const d = ((e[k] - avg) * w[k] * dir) / 100;
    if (d > 0 && (!best || d > best.d)) best = { k, v: e[k], avg, d };
  }
  return best;
}

export type EngineExplainer = {
  /** What the chart shows. */
  what: string;
  /** Why the bars look the way they do this check. */
  why: string[];
};

export function explainEngines(
  perEngine: PerEngine[],
  answers: Record<string, number>,
  engineWeights: Record<string, number>,
  metricWeights: MetricWeights,
  brandName: string,
  /** True when the check asked the engines with live web search (method v2). */
  searched: boolean,
): EngineExplainer | null {
  if (!perEngine.length) return null;
  const what =
    `Each bar is ${brandName}'s GEO score (0–100) in one AI assistant's answers to the ` +
    "questions we track. It uses the same weighted measures as the headline score: " +
    `whether ${brandName} is named, its share of the brands named, whether its own site ` +
    "is cited, how prominently, how positively and how accurately. Higher means buyers " +
    `asking that assistant are more likely to come across ${brandName}.`;

  const why: string[] = [];
  const sorted = [...perEngine].sort((a, b) => b.geo - a.geo);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const fmt = (e: PerEngine) => `${e.engine} (${r1(e.geo)})`;

  if (sorted.length === 1) {
    why.push(`Only ${top.engine} was measured in this check, so there is nothing to compare yet.`);
  } else if (top.geo - bottom.geo < LEVEL_SPREAD) {
    why.push(
      `All engines score within ${LEVEL_SPREAD} points of each other, so ${brandName}'s ` +
        "visibility is consistent across the AI assistants measured.",
    );
  } else {
    const others = (e: PerEngine) => perEngine.filter((o) => o !== e);
    const up = driver(top, others(top), metricWeights, 1);
    why.push(
      `${fmt(top)} scores highest` +
        (up
          ? `: it ${describe(up.k, up.v, brandName)}, against ${Math.round(up.avg)}${unit(up.k)} on average for the other engines.`
          : "."),
    );
    if (bottom.mention === 0) {
      why.push(
        `${fmt(bottom)} scores lowest: it didn't name ${brandName} in any of its answers, ` +
          "so the measures that depend on being named score zero too.",
      );
    } else {
      const down = driver(bottom, others(bottom), metricWeights, -1);
      why.push(
        `${fmt(bottom)} scores lowest` +
          (down
            ? `: it only ${describe(down.k, down.v, brandName)}, against ${Math.round(down.avg)}${unit(down.k)} on average for the other engines.`
            : "."),
      );
    }
    why.push(
      (searched
        ? "Engines differ because each runs its own web search and trusts different sites. "
        : "Engines differ because each learnt from different material and trusts different sites. ") +
        "Coverage on a site one engine relies on can lift that engine without moving the " +
        "others — Sources AI trusts shows which sites each engine cites.",
    );
  }

  const few = perEngine.filter((e) => (answers[e.engine] || 0) < FEW_ANSWERS);
  if (few.length) {
    why.push(
      list(few.map((e) => `${e.engine} gave only ${plural(answers[e.engine] || 0, "answer")}`)) +
        `, so ${few.length === 1 ? "its score" : "those scores"} can move a lot from one check to the next.`,
    );
  }

  const measured = perEngine.map((e) => e.engine);
  const missing = ENGINES.filter((e) => !measured.includes(e));
  const wsum = measured.reduce((s, e) => s + (+engineWeights[e] || 0), 0);
  if (wsum > 0 && measured.length > 1) {
    const shares = [...measured]
      .sort((a, b) => (+engineWeights[b] || 0) - (+engineWeights[a] || 0))
      .map((e) => `${e} ${Math.round(((+engineWeights[e] || 0) / wsum) * 100)}%`);
    why.push(
      "The headline GEO score blends these bars using this client's engine weights " +
        `(roughly how widely each assistant is used): ${shares.join(", ")}.` +
        (missing.length
          ? ` ${list(missing)} ${missing.length === 1 ? "wasn't" : "weren't"} measured in this check.`
          : ""),
    );
  }
  return { what, why };
}
