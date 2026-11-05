import { parseCsv } from "./csv";
import type { Prompt, SearchTerm } from "./types";

// Search demand — the SEO input to question choice.
//
// SEO and GEO are kept apart on purpose:
//   • SEO (this file): what people type into Google, imported from Search
//     Console or a keyword tool. Used ONLY to help decide which questions to
//     ask the AI engines. Never scored.
//   • GEO (everything else): whether the AI engines name, cite and recommend
//     the client. That is what the GEO score measures.
// Anything shown from this file is labelled "SEO" in the UI.

export type DemandKind = "volume" | "impressions";

export type ParsedTerm = {
  query: string;
  volume: number | null;
  impressions: number | null;
  clicks: number | null;
  position: number | null;
};

export type ParseResult = {
  terms: ParsedTerm[];
  /** Best guess at where the data came from, shown back to the team. */
  source: string;
  /** Rows that had no usable search term. */
  skipped: number;
};

/** Lower-case, trimmed, single-spaced — how terms are stored and matched. */
export function normQuery(q: string): string {
  return q.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Reads an export as text. Google Keyword Planner downloads are UTF-16 with a
 * byte-order mark; everything else is UTF-8.
 */
export async function readExportFile(f: File): Promise<string> {
  const buf = new Uint8Array(await f.arrayBuffer());
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  return new TextDecoder("utf-8").decode(buf);
}

const QUERY_COLS = [
  "query",
  "queries",
  "top queries",
  "top query",
  "keyword",
  "keywords",
  "search term",
  "search terms",
  "search query",
  "search queries",
];
const VOLUME_COLS = [
  "volume",
  "search volume",
  "avg. monthly searches",
  "avg monthly searches",
  "average monthly searches",
  "monthly searches",
  "monthly volume",
  "global volume",
  "sv",
];
const IMPRESSION_COLS = ["impressions", "impr.", "impr"];
const CLICK_COLS = ["clicks", "url clicks"];
const POSITION_COLS = ["position", "avg. position", "average position", "avg position", "current position"];

const clean = (h: string) => h.replace(/^﻿/, "").trim().toLowerCase();

function colIndex(header: string[], names: string[]): number {
  return header.findIndex((h) => names.includes(clean(h)));
}

/**
 * "12,100" → 12100, "1.2K" → 1200, "1K – 10K" → 1000 (lower bound), "" → null.
 * Keyword Planner shows ranges; the lower bound keeps us from overstating demand.
 */
export function parseNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  const m = String(raw)
    .replace(/[ \s]/g, "")
    .replace(/,(?=\d{3}\b)/g, "")
    .match(/(\d+(?:[.,]\d+)?)([kKmM])?/);
  if (!m) return null;
  let n = parseFloat(m[1].replace(",", "."));
  if (m[2]) n *= /m/i.test(m[2]) ? 1_000_000 : 1_000;
  return Number.isFinite(n) ? n : null;
}

const toInt = (raw: string | undefined) => {
  const n = parseNumber(raw);
  return n == null ? null : Math.round(n);
};

/**
 * Parses a Search Console "Queries" export, a keyword-tool export (Semrush,
 * Ahrefs, Keyword Planner, …) or a plain pasted list (one term per line,
 * optionally followed by a number = monthly searches).
 */
export function parseSearchExport(text: string): ParseResult {
  const src = text.replace(/^\uFEFF/, "");
  // Keyword Planner puts a title and date range above the real header, so the
  // separator is taken from whichever of the first lines is the header.
  let sep: "," | ";" | "\t" | null = null;
  for (const line of src.split(/\r?\n/).slice(0, 8)) {
    sep = ([",", ";", "\t"] as const).find((c) => colIndex(line.split(c), QUERY_COLS) >= 0) || null;
    if (sep) break;
  }
  const rows = sep ? parseCsv(src, sep) : [];
  const headerAt = rows.findIndex((r, i) => i < 8 && colIndex(r, QUERY_COLS) >= 0);

  const byQuery = new Map<string, ParsedTerm>();
  let skipped = 0;
  const add = (t: ParsedTerm) => {
    const query = normQuery(t.query);
    if (!query || query.length > 300 || /^\d+$/.test(query)) {
      skipped++;
      return;
    }
    const prev = byQuery.get(query);
    // Same term twice (e.g. two locations): keep the larger demand.
    if (!prev || (t.volume ?? t.impressions ?? 0) > (prev.volume ?? prev.impressions ?? 0)) {
      byQuery.set(query, { ...t, query });
    }
  };

  let source: string;
  if (headerAt >= 0) {
    const h = rows[headerAt];
    const qi = colIndex(h, QUERY_COLS);
    const vi = colIndex(h, VOLUME_COLS);
    const ii = colIndex(h, IMPRESSION_COLS);
    const ci = colIndex(h, CLICK_COLS);
    const pi = colIndex(h, POSITION_COLS);
    for (const r of rows.slice(headerAt + 1)) {
      add({
        query: r[qi] || "",
        volume: vi >= 0 ? toInt(r[vi]) : null,
        impressions: ii >= 0 ? toInt(r[ii]) : null,
        clicks: ci >= 0 ? toInt(r[ci]) : null,
        position: pi >= 0 ? parseNumber(r[pi]) : null,
      });
    }
    const lower = h.map(clean);
    source =
      ii >= 0
        ? "Google Search Console"
        : lower.some((c) => c.includes("avg. monthly searches") || c.includes("avg monthly searches"))
          ? "Google Keyword Planner"
          : vi >= 0
            ? "Keyword tool export"
            : "Search term list";
  } else {
    // No recognised header: a pasted list — "term", or "term" then a tab,
    // comma or semicolon and a number (monthly searches), per line.
    for (const line of src.split(/\r?\n/)) {
      const t = line.trim().replace(/^"|"$/g, "");
      if (!t) continue;
      const m = t.match(/^(.*?)\s*[\t,;]\s*"?(\d[\d,.\u00a0 ]*\s*[kKmM]?)"?$/);
      const vol = m ? parseNumber(m[2]) : null;
      add({
        query: m && vol != null ? m[1] : t,
        volume: m && vol != null ? Math.round(vol) : null,
        impressions: null,
        clicks: null,
        position: null,
      });
    }
    source = "Pasted list";
  }

  const terms = [...byQuery.values()].sort((a, b) => demandValue(b) - demandValue(a));
  return { terms, source, skipped };
}

/** Monthly searches if known, else Search Console impressions. */
export function demandOf(t: Pick<SearchTerm, "volume" | "impressions">): {
  value: number | null;
  kind: DemandKind | null;
} {
  if (t.volume != null) return { value: t.volume, kind: "volume" };
  if (t.impressions != null) return { value: t.impressions, kind: "impressions" };
  return { value: null, kind: null };
}

function demandValue(t: Pick<SearchTerm, "volume" | "impressions">): number {
  return demandOf(t).value ?? -1;
}

function compact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "") + "m";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "") + "k";
  return String(n);
}

/** "12.1k searches/mo" or "3.4k Google impressions". */
export function formatDemand(value: number | null | undefined, kind: string | null | undefined): string {
  if (value == null || !kind) return "demand unknown";
  return kind === "impressions"
    ? `${compact(value)} Google impressions`
    : `${compact(value)} searches/mo`;
}

/** Looks like a question someone typed ("how do i…", "best … for …", "x vs y"). */
export function isQuestionStyle(q: string): boolean {
  return /^(who|what|which|where|when|why|how|is|are|can|do|does|should|best|top)\b|\?|\bvs\.?\b|\bversus\b|\balternatives?\b|\bfor\b/i.test(
    q,
  );
}

/** Tooltip/explainer for an SEO-informed question. */
export function seoOriginText(p: Pick<Prompt, "seo_seed" | "seo_demand" | "seo_demand_kind">): string {
  return (
    `SEO input: drafted from the Google search “${p.seo_seed}” (${formatDemand(
      p.seo_demand,
      p.seo_demand_kind,
    )} when added). ` +
    "Search data only helped choose this question — the AI answers and scores for it are GEO measurement."
  );
}

export type BriefSearchTerm = {
  query: string;
  demand: number | null;
  demand_kind: DemandKind | null;
  clicks: number | null;
  google_position: number | null;
  question_style: boolean;
  already_tracked: boolean;
};

/**
 * The search terms sent to the AI strategist: the highest-demand terms plus
 * question-style ones further down the list (the long tail is often where AI
 * visibility is won), flagging terms a tracked question already came from.
 */
export function termsForBrief(terms: SearchTerm[], prompts: Prompt[], limit = 80): BriefSearchTerm[] {
  const used = new Set(prompts.map((p) => (p.seo_seed ? normQuery(p.seo_seed) : "")).filter(Boolean));
  const sorted = [...terms].sort((a, b) => demandValue(b) - demandValue(a));
  const head = sorted.slice(0, Math.ceil(limit * 0.7));
  const headSet = new Set(head.map((t) => t.id));
  const tail = sorted.filter((t) => !headSet.has(t.id) && isQuestionStyle(t.query));
  return [...head, ...tail].slice(0, limit).map((t) => {
    const d = demandOf(t);
    return {
      query: t.query,
      demand: d.value,
      demand_kind: d.kind,
      clicks: t.clicks,
      google_position: t.position,
      question_style: isQuestionStyle(t.query),
      already_tracked: used.has(normQuery(t.query)),
    };
  });
}
