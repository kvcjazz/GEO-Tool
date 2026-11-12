// What a measurement will spend, in words the team can weigh before clicking.
//
// One "cell" is a question × live engine pair. Measuring it asks the engine the
// question `samples` times with web search (the expensive part), then makes up
// to two analysis calls: one rating every sample that names the client, one
// reading the brands the answers name.

/** A full re-check within this many days of the last one gets a warning. */
export const RECENT_CHECK_DAYS = 25;

export function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

const plural = (n: number, one: string, many = one + "s") => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

/** "120 question × engine pairs: 360 AI answers with web search, plus up to 240 analysis calls". */
export function checkCost(cells: number, samples: number): string {
  return (
    plural(cells, "question × engine pair") +
    ": " +
    plural(cells * samples, "AI answer") +
    " with web search, plus up to " +
    plural(cells * 2, "analysis call")
  );
}

/** How a gap since the last check reads in a warning. */
export function agoText(days: number): string {
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}
