import { host } from "./format";
import { isArticleUrl, sameArticle, type V2Answer } from "./prImpact";
import { rawUrls } from "./targets";
import type { PrActivity, Response } from "./types";
import type { getSupabaseBrowserClient } from "./supabase/client";

// Which AI answers cite which logged placement. The exact article is matched
// where the placement has an article link; a home-page link can only be
// matched to the outlet's site. `cited` flags placements cited in the current
// check or in any measurement-v2 check since publication.

export function citationLinks(
  placements: Pick<PrActivity, "id" | "url" | "activity_date">[],
  responses: Pick<Response, "id" | "raw" | "cited_sources" | "cited_pr_id">[],
  answers: V2Answer[] | null,
): { links: { id: string; pr: string }[]; cited: Set<string> } {
  const links: { id: string; pr: string }[] = [];
  const cited = new Set<string>();
  for (const p of placements) {
    const d = host(p.url || "");
    if (!d) continue;
    const article = isArticleUrl(p.url);
    for (const r of responses) {
      const hit = article
        ? rawUrls(r.raw).some((u) => sameArticle(u, p.url!))
        : !!r.cited_sources && r.cited_sources.toLowerCase().includes(d);
      if (hit) {
        cited.add(p.id);
        if (r.cited_pr_id !== p.id) links.push({ id: r.id, pr: p.id });
      }
    }
    if (article && answers?.some((a) => a.run_date >= p.activity_date && a.urls.some((u) => sameArticle(u, p.url!)))) {
      cited.add(p.id);
    }
  }
  return { links, cited };
}

/** Saves the links and flags; returns how many answers were newly linked. */
export async function applyCitationLinks(
  sb: ReturnType<typeof getSupabaseBrowserClient>,
  res: { links: { id: string; pr: string }[]; cited: Set<string> },
): Promise<number> {
  let linked = 0;
  for (const u of res.links) {
    const { error } = await sb.from("geo_responses").update({ cited_pr_id: u.pr }).eq("id", u.id);
    if (!error) linked++;
  }
  const ids = [...res.cited];
  for (let i = 0; i < ids.length; i += 100) {
    await sb.from("geo_pr_activity").update({ cited: true }).in("id", ids.slice(i, i + 100));
  }
  return linked;
}
