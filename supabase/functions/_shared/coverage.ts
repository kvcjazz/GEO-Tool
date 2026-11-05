// Deciding which stored coverage details are wrong and what to replace them
// with, given what the article's page says. Pure, so it can be tested.
import { splitTitle } from "./pagemeta.ts";

export type Placement = {
  id: string;
  url: string | null;
  outlet: string;
  headline: string | null;
  activity_date: string;
  created_at: string;
};

export type Found = { outlet: string | null; headline: string | null; date: string | null; outlet_from: string };

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** True when the stored "publication" is really a headline or a guess. */
export function outletLooksWrong(p: Placement, f: Found | undefined): boolean {
  const o = p.outlet.trim();
  if (!o) return true;
  if (words(o) > 5) return true;
  if (f?.headline && (same(o, f.headline) || same(splitTitle(o).headline, f.headline))) return true;
  // "Headline | Publication" or "Headline - Publication" stored whole.
  if (splitTitle(o).outlet && words(o) > 3) return true;
  return false;
}

/** The fields to change on a placement, or null when it already looks right. */
export function repairPatch(
  p: Placement,
  f: Found | undefined,
): Partial<Pick<Placement, "outlet" | "headline" | "activity_date">> | null {
  const patch: Partial<Pick<Placement, "outlet" | "headline" | "activity_date">> = {};
  const wrong = outletLooksWrong(p, f);
  if (wrong) {
    // Best name available: the page's, else the " - Publication" suffix of the
    // stored text, else whatever the lookup found (AI or site name).
    const suffix = splitTitle(p.outlet).outlet;
    const name = f?.outlet_from === "page" || f?.outlet_from === "headline" ? f.outlet : suffix || f?.outlet;
    if (name && !same(name, p.outlet)) {
      patch.outlet = name.slice(0, 80);
      if (!p.headline) patch.headline = f?.headline || splitTitle(p.outlet).headline || p.outlet;
    }
  }
  if (!p.headline && !patch.headline && f?.headline) patch.headline = f.headline;
  // Only dates that were just the day the piece was logged are replaced.
  if (f?.date && p.activity_date === p.created_at.slice(0, 10) && f.date !== p.activity_date) {
    patch.activity_date = f.date;
  }
  return Object.keys(patch).length ? patch : null;
}
