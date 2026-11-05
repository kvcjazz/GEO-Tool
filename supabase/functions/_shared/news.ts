// Recent news for the Radar and news panels, from Google News RSS search.
//
// Why not GDELT: the GDELT API never completes a TLS handshake from Supabase's
// edge network (verified with pg_net, Nov 2026), and its errors were swallowed,
// so every news panel was silently empty. Google News RSS needs no key, answers
// from the same network, and can be localised to the client's market.

export type Article = { title: string; url: string; domain: string; seendate: string };

/** Quote multi-word terms for an OR query. */
function quo(t: string): string {
  return /\s/.test(t) ? `"${t.replace(/"/g, "")}"` : t;
}

export function orQuery(terms: (string | null | undefined)[], max = 7): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const t = String(raw ?? "").trim();
    if (!t || seen.has(t.toLowerCase()) || out.length >= max) continue;
    seen.add(t.toLowerCase());
    out.push(quo(t));
  }
  return out.length ? "(" + out.join(" OR ") + ")" : "";
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : "";
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Parses Google News RSS items. Exported for tests. */
export function parseRss(xml: string): Article[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  const out: Article[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const src = it.match(/<source\s+url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/);
    const source = src ? decode(src[2]) : "";
    let title = tag(it, "title");
    // Titles end with " - Source name".
    if (source && title.endsWith(" - " + source)) title = title.slice(0, -(source.length + 3));
    const url = tag(it, "link");
    const domain = src ? hostOf(src[1]) : hostOf(url);
    const date = tag(it, "pubDate");
    if (!title || !url || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    const d = new Date(date);
    out.push({
      title,
      url,
      domain: domain || source,
      seendate: isNaN(d.getTime()) ? date : d.toISOString(),
    });
  }
  return out;
}

/** Google News edition for a market (English-language editions). */
function edition(country: string | null): string {
  const c = (country || "US").toUpperCase();
  return `hl=en-${c}&gl=${c}&ceid=${c}:en`;
}

/**
 * Stories matching `query` from the last `days` days, newest first. Never
 * throws; on failure returns `error` so callers can say why the panel is empty.
 */
export async function googleNews(
  query: string,
  opts: { country?: string | null; days?: number; max?: number } = {},
): Promise<{ articles: Article[]; error?: string }> {
  if (!query) return { articles: [] };
  const q = `${query} when:${opts.days || 14}d`;
  const url = "https://news.google.com/rss/search?q=" + encodeURIComponent(q) + "&" +
    edition(opts.country || null);
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return { articles: [], error: `Google News HTTP ${r.status}` };
    const articles = parseRss(await r.text())
      .sort((a, b) => b.seendate.localeCompare(a.seendate))
      .slice(0, opts.max || 20);
    return { articles };
  } catch (e) {
    return { articles: [], error: "Google News: " + String(e) };
  }
}

/** Theme news for a client: its themes, else its name and sector, in its market. */
export async function themeNews(b: {
  themes?: string | null;
  brand?: string | null;
  sector?: string | null;
  country?: string | null;
}): Promise<{ articles: Article[]; query: string; error?: string }> {
  const themes = String(b.themes || "").split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  const terms = themes.length ? [...themes, b.brand] : [b.brand, b.sector];
  const query = orQuery(terms.length ? terms : ["technology"]);
  let res = await googleNews(query, { country: b.country });
  // A thin local edition falls back to the international one.
  if (b.country && res.articles.length < 3) {
    const wide = await googleNews(query, { country: "US" });
    if (wide.articles.length > res.articles.length) res = wide;
  }
  return { ...res, query };
}

export async function competitorNews(
  competitors: string[],
  country?: string | null,
): Promise<{ articles: Article[]; error?: string }> {
  const q = orQuery(competitors.filter(Boolean), 8);
  return q ? await googleNews(q, { country }) : { articles: [] };
}
