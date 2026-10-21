// Deterministic checks for measurement v2. Everything here is plain code, not
// model judgement: whether a name appears in an answer, which competitors are
// named, whether the client's own site is among the real citations, and the
// quote shown as evidence. Keeping these out of the model is what makes them
// repeatable from one run to the next.

import { domainOf } from "./providers.ts";

export type Named = { name: string; aliases?: string[] | null };

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Matches a name as a whole word, case-insensitively, tolerating any run of
 * spaces or hyphens between its words ("Acme Corp" ≈ "acme-corp"). Letters or
 * digits directly either side mean a different word ("Box" is not "Dropbox").
 */
export function nameRegex(name: string): RegExp | null {
  const words = name.trim().split(/[\s-]+/).filter(Boolean).map(escapeRe);
  if (!words.length) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])${words.join("[\\s-]+")}(?![\\p{L}\\p{N}])`, "iu");
}

function terms(n: Named): string[] {
  return [n.name, ...(n.aliases || [])].map((s) => (s || "").trim()).filter(Boolean);
}

/** True when the text names the entity by its name or any alias. */
export function names(text: string, n: Named): boolean {
  return terms(n).some((t) => nameRegex(t)?.test(text) ?? false);
}

/** The competitors (by primary name) the text names. */
export function competitorsNamed(text: string, competitors: Named[]): string[] {
  return competitors.filter((c) => names(text, c)).map((c) => c.name);
}

/** Bare hostname of a website setting, tolerant of a missing scheme. */
export function siteDomain(website: string | null | undefined): string {
  const w = (website || "").trim();
  if (!w) return "";
  return domainOf(/^https?:\/\//i.test(w) ? w : "https://" + w);
}

/** Unique citation domains, in first-seen order. */
export function citationDomains(urls: string[]): string[] {
  const out: string[] = [];
  for (const u of urls) {
    const d = domainOf(u);
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
}

/** True when any cited domain is the site itself or one of its subdomains. */
export function citesSite(domains: string[], site: string): boolean {
  if (!site) return false;
  return domains.some((d) => d === site || d.endsWith("." + site));
}

/**
 * The first sentence (or line) that names the entity, as the evidence quote.
 * Falls back to an empty string when the entity is not named.
 */
export function evidenceFor(text: string, n: Named, max = 400): string {
  const pieces = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const hit = pieces.find((s) => names(s, n));
  if (!hit) return "";
  return hit.length > max ? hit.slice(0, max - 1) + "…" : hit;
}

/** Most frequent non-empty value, earliest wins a tie. */
export function mode(values: (string | null | undefined)[]): string | null {
  const counts: Record<string, number> = {};
  let best: string | null = null;
  let bestCount = 0;
  for (const v of values) {
    if (v == null || v === "") continue;
    counts[v] = (counts[v] || 0) + 1;
    if (counts[v] > bestCount) {
      bestCount = counts[v];
      best = v;
    }
  }
  return best;
}
