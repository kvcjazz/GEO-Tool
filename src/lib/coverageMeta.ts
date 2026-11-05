import { callFn } from "./callFn";
import { CoverageMetaSchema } from "./schemas";
import type { PageMeta } from "./coverageImport";

/**
 * Publication, headline and publish date for each link, read from the article
 * pages by geo-coverage-meta, 60 links per call. Links that fail are simply
 * missing from the map.
 */
export async function readPages(
  urls: string[],
  headlines: Record<string, string> = {},
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, PageMeta>> {
  const out = new Map<string, PageMeta>();
  const list = [...new Set(urls)];
  for (let i = 0; i < list.length; i += 60) {
    const chunk = list.slice(i, i + 60);
    const hl: Record<string, string> = {};
    for (const u of chunk) if (headlines[u]) hl[u] = headlines[u];
    try {
      const j = await callFn("geo-coverage-meta", { urls: chunk, headlines: hl }, CoverageMetaSchema);
      for (const it of j.items || []) {
        out.set(it.url, {
          url: it.url,
          outlet: it.outlet ?? null,
          headline: it.headline ?? null,
          date: it.date ?? null,
          outlet_from: it.outlet_from ?? undefined,
        });
      }
    } catch {
      // A failed batch leaves those links to the fallbacks.
    }
    onProgress?.(Math.min(i + 60, list.length), list.length);
  }
  return out;
}
