import { host } from "./format";
import type { Brand, Response } from "./types";

// Which sites the AI engines cite, from each answer's recorded cited sources.

export function domainOf(s: string): string {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

/** True when the domain is the client's own site (or a subdomain of it). */
export function isOwnSite(domain: string, brand: Pick<Brand, "website">): boolean {
  const own = host(brand.website || "");
  return !!own && (domain === own || domain.endsWith("." + own));
}

function citedDomains(r: Response): string[] {
  return String(r.cited_sources || "")
    .split(/[,;]/)
    .map(domainOf)
    .filter(Boolean);
}

export type SourceRow = { domain: string; count: number; engines: string[] };

/** Every cited site, most-cited first. */
export function citedSources(responses: Response[]): SourceRow[] {
  const counts: Record<string, number> = {};
  const engines: Record<string, Set<string>> = {};
  for (const r of responses) {
    for (const d of citedDomains(r)) {
      counts[d] = (counts[d] || 0) + 1;
      (engines[d] ||= new Set()).add(r.engine);
    }
  }
  return Object.keys(counts)
    .map((d) => ({ domain: d, count: counts[d], engines: [...engines[d]] }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Sites the engines cite in answers that don't name the client — the places
 * it most needs coverage on to be found by new buyers.
 */
export function gapSources(brand: Brand, responses: Response[]): SourceRow[] {
  return citedSources(responses.filter((r) => !r.mentioned)).filter(
    (s) => !isOwnSite(s.domain, brand),
  );
}
