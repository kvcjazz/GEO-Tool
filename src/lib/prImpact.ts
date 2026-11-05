import { host } from "./format";
import type { PrActivity, Prompt } from "./types";

// Did a piece of PR coverage reach AI answers? For each logged placement:
//   1. Article cited — is the exact article URL among the citations of any
//      answer measured since it was published? (Strongest evidence.)
//   2. Outlet cited — how often answers cite the outlet's site, in the last
//      check before the placement vs the latest check after it.
//   3. Visibility on related questions — how often the client is named, before
//      vs after, on tracked questions that share the placement's topic, using
//      only question × engine pairs measured in both checks so it's like for like.
// Only measurement-v2 checks are used (unprimed questions, live web search),
// so before and after are comparable. This shows association, not proof of
// cause: other activity and normal answer variation also move the numbers.

export type V2Answer = {
  run_id: string;
  run_date: string;
  run_created: string;
  prompt_id: string;
  engine: string;
  mentioned: boolean;
  cited_sources: string | null;
  urls: string[];
};

export type CheckRef = { id: string; date: string };

export type Rate = { named: number; answers: number; pct: number };

export type Hit = { prompt_id: string; engine: string; run_id: string; url: string };

export type PlacementImpact = {
  pr: PrActivity;
  /** Article-level matching is only possible when the URL points at an article. */
  articleUrl: boolean;
  articleHits: Hit[];
  before: CheckRef | null;
  after: CheckRef | null;
  outletDomain: string | null;
  outletBefore: Rate | null;
  outletAfter: Rate | null;
  keywords: string[];
  related: string[];
  relatedBefore: Rate | null;
  relatedAfter: Rate | null;
  overallBefore: Rate | null;
  overallAfter: Rate | null;
  status: "cited" | "outlet_up" | "waiting" | "not_yet";
};

const STOP = new Set(
  (
    "a an and are as at be best but by can do does for from get good has have how in into is it its " +
    "of on or our should than that the their them there these they this those to top use using vs " +
    "was what when where which who why will with without your you about after also more most new " +
    "news article articles html htm feature features story stories press release list lists says " +
    "said year years month blog post page index www com co uk org net amp wont dont isnt"
  ).split(" "),
);

function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("es") && !w.endsWith("ses")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function words(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !STOP.has(w))
    .map(stem);
}

/** Path words of an article URL ("…/hippo-ceo-says-growth-starts…" → ceo, growth, start). */
function slugWords(url: string | null): string[] {
  if (!url) return [];
  try {
    const u = new URL(url.startsWith("http") ? url : "https://" + url);
    return words(decodeURIComponent(u.pathname).replace(/\.(html?|php|aspx?)$/, ""));
  } catch {
    return [];
  }
}

/** Lower-case URL without scheme, www., query, fragment or trailing slash. */
export function normUrl(u: string): string {
  return (u || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
}

/** True when the URL points below the site's home page. */
export function isArticleUrl(u: string | null): boolean {
  const n = normUrl(u || "");
  const i = n.indexOf("/");
  return i > 0 && n.length - i > 2;
}

export function sameArticle(a: string, b: string): boolean {
  const x = normUrl(a);
  const y = normUrl(b);
  if (!x || !y) return false;
  // Allow one side to be truncated (some outlets append IDs or slugs).
  return x === y || (x.length > 20 && y.startsWith(x)) || (y.length > 20 && x.startsWith(y));
}

function rate(rows: V2Answer[]): Rate | null {
  if (!rows.length) return null;
  const named = rows.filter((r) => r.mentioned).length;
  return { named, answers: rows.length, pct: Math.round((named / rows.length) * 100) };
}

function citesDomain(r: V2Answer, d: string): boolean {
  const own = (s: string) => s === d || s.endsWith("." + d);
  if (r.urls.some((u) => own(host(u)))) return true;
  return String(r.cited_sources || "")
    .split(/[,;]/)
    .map((s) => s.trim().toLowerCase().replace(/^www\./, ""))
    .some(own);
}

/** Checks in date order (same-day checks by creation time). */
export function checksOf(answers: V2Answer[]): CheckRef[] {
  const seen = new Map<string, { date: string; created: string }>();
  for (const a of answers) {
    if (!seen.has(a.run_id)) seen.set(a.run_id, { date: a.run_date, created: a.run_created });
  }
  return [...seen.entries()]
    .sort((a, b) =>
      a[1].date === b[1].date ? a[1].created.localeCompare(b[1].created) : a[1].date.localeCompare(b[1].date),
    )
    .map(([id, v]) => ({ id, date: v.date }));
}

export function placementImpact(
  pr: PrActivity,
  answers: V2Answer[],
  prompts: Prompt[],
  brandWords: string[],
): PlacementImpact {
  const checks = checksOf(answers);
  const date = pr.activity_date;
  // A check on the publication day counts as "before": coverage takes time to
  // be indexed and cited.
  const before = [...checks].reverse().find((c) => c.date <= date) || null;
  const after = [...checks].reverse().find((c) => c.date > date) || null;
  const inRun = (id: string | undefined) => answers.filter((a) => a.run_id === id);
  const beforeRows = inRun(before?.id);
  const afterRows = inRun(after?.id);

  // 1. The article itself.
  const articleUrl = isArticleUrl(pr.url);
  const articleHits: Hit[] = [];
  if (articleUrl && pr.url) {
    for (const a of answers) {
      if (a.run_date < date) continue;
      const u = a.urls.find((x) => sameArticle(x, pr.url!));
      if (u) articleHits.push({ prompt_id: a.prompt_id, engine: a.engine, run_id: a.run_id, url: u });
    }
  }

  // 2. The outlet's site, like for like.
  const outletDomain = host(pr.url || "") || null;
  const pairsIn = (rows: V2Answer[]) => new Set(rows.map((r) => r.prompt_id + "|" + r.engine));
  const both = (() => {
    const a = pairsIn(beforeRows);
    const b = pairsIn(afterRows);
    return new Set([...a].filter((k) => b.has(k)));
  })();
  const paired = (rows: V2Answer[]) => rows.filter((r) => both.has(r.prompt_id + "|" + r.engine));
  const citeRate = (rows: V2Answer[]): Rate | null => {
    if (!outletDomain || !rows.length) return null;
    const n = rows.filter((r) => citesDomain(r, outletDomain)).length;
    return { named: n, answers: rows.length, pct: Math.round((n / rows.length) * 100) };
  };

  // 3. Related questions.
  const own = new Set(brandWords.flatMap(words));
  const keywords = [...new Set([...words(pr.theme || ""), ...slugWords(pr.url)])].filter(
    (w) => !own.has(w),
  );
  const related = prompts
    .filter((p) => {
      const qw = new Set(words(p.text));
      return keywords.some((k) => qw.has(k));
    })
    .map((p) => p.id);
  const relSet = new Set(related);
  const relOnly = (rows: V2Answer[]) => rows.filter((r) => relSet.has(r.prompt_id));

  const hasPair = before && after && both.size > 0;
  const outletBefore = hasPair ? citeRate(paired(beforeRows)) : null;
  const outletAfter = after ? citeRate(hasPair ? paired(afterRows) : afterRows) : null;

  let status: PlacementImpact["status"] = "not_yet";
  if (articleHits.length) status = "cited";
  else if (!after) status = "waiting";
  else if (outletBefore && outletAfter && outletAfter.pct > outletBefore.pct) status = "outlet_up";

  return {
    pr,
    articleUrl,
    articleHits,
    before,
    after,
    outletDomain,
    outletBefore,
    outletAfter,
    keywords,
    related,
    relatedBefore: hasPair ? rate(relOnly(paired(beforeRows))) : null,
    relatedAfter: hasPair ? rate(relOnly(paired(afterRows))) : null,
    overallBefore: hasPair ? rate(paired(beforeRows)) : null,
    overallAfter: hasPair ? rate(paired(afterRows)) : null,
    status,
  };
}

/** Answers in the latest check that cite any logged PR article (or PR homepage URL). */
export function prCitedShare(
  pr: PrActivity[],
  answers: V2Answer[],
): { citing: number; answers: number; pct: number; runId: string | null } {
  const checks = checksOf(answers);
  const last = checks[checks.length - 1];
  if (!last) return { citing: 0, answers: 0, pct: 0, runId: null };
  const rows = answers.filter((a) => a.run_id === last.id);
  const citing = rows.filter((a) =>
    pr.some((p) =>
      p.url && isArticleUrl(p.url)
        ? a.urls.some((u) => sameArticle(u, p.url!))
        : false,
    ),
  ).length;
  return {
    citing,
    answers: rows.length,
    pct: rows.length ? Math.round((citing / rows.length) * 100) : 0,
    runId: last.id,
  };
}
