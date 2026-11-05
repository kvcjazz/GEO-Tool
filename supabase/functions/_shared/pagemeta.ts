// Publication name, headline and publish date of an article, read from its
// page's own metadata (Open Graph, schema.org JSON-LD, article meta tags), with
// fallbacks for pages that can't be read: the " - Publication" suffix on a
// headline, and the date in the article's address.

export type PageMeta = {
  outlet: string | null;
  headline: string | null;
  date: string | null;
};

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;|&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&(rsquo|lsquo);/g, "’")
    .replace(/&(rdquo|ldquo);/g, '"')
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&hellip;/g, "…")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

/** content="" of a <meta> whose property/name/itemprop is one of `keys`. */
function meta(html: string, keys: string[]): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const k = /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (!k || !keys.includes(k)) continue;
    const v = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag);
    const val = decode((v?.[1] ?? v?.[2]) || "");
    if (val) return val;
  }
  return null;
}

type Ld = Record<string, unknown>;

function ldNodes(html: string): Ld[] {
  const out: Ld[] = [];
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const j = JSON.parse(m[1].trim());
      const walk = (x: unknown) => {
        if (Array.isArray(x)) x.forEach(walk);
        else if (x && typeof x === "object") {
          out.push(x as Ld);
          const g = (x as Ld)["@graph"];
          if (g) walk(g);
        }
      };
      walk(j);
    } catch {
      // Malformed JSON-LD is common; ignore it.
    }
  }
  return out;
}

const ARTICLE = /article|newsarticle|blogposting|report|webpage|videoobject|podcastepisode/i;

/** YYYY-MM-DD from an ISO-ish date string. */
function isoDay(s: string | null | undefined): string | null {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  if (!m) return null;
  const y = +m[1];
  return y >= 1995 && y <= 2100 ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** The date in an article's address: /2026/10/30/, /2026-10-30, /20261008/. */
export function dateFromUrl(url: string): string | null {
  let path = "";
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const a = /\/(20\d{2})[/-](\d{1,2})[/-](\d{1,2})(?:\/|-|$)/.exec(path);
  const b = /\/(20\d{2})(\d{2})(\d{2})(?:\/|$)/.exec(path);
  const m = a || b;
  if (!m) return null;
  const mo = +m[2];
  const d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "Headline - Reinsurance News" → { headline, outlet: "Reinsurance News" }. */
export function splitTitle(title: string): { headline: string; outlet: string | null } {
  const t = decode(title);
  const parts = t.split(/\s+(?:[|\-–—•:]|::)\s+/);
  if (parts.length < 2) return { headline: t, outlet: null };
  const last = parts[parts.length - 1].trim();
  // A publication name is short and doesn't end in punctuation.
  if (last.split(/\s+/).length <= 5 && last.length <= 40 && !/[.?!]$/.test(last)) {
    return { headline: parts.slice(0, -1).join(" - ").trim(), outlet: last };
  }
  return { headline: t, outlet: null };
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const SKIP = new Set(["www", "com", "co", "uk", "net", "org", "news", "info", "io", "us", "eng", "tv", "en", "m"]);

/**
 * True when a publication name plausibly belongs to the site: "Reinsurance
 * News" ↔ reinsurancene.ws, "Yahoo Finance" ↔ finance.yahoo.com, "New York
 * Stock Exchange" ↔ nyse.com. False for a parent brand like "FF News" on
 * insurtecheye.com.
 */
export function matchesDomain(name: string, domain: string): boolean {
  const n = squash(name);
  if (!n) return false;
  const labels = domain.toLowerCase().split(".").filter((l) => l.length >= 3 && !SKIP.has(l));
  const initials = name.split(/[\s&-]+/).filter(Boolean).map((w) => w[0]).join("").toLowerCase();
  return labels.some((l) => {
    const b = squash(l);
    return n.includes(b) || b.includes(n) || (initials.length >= 3 && b.startsWith(initials));
  });
}

/** "Coverager - Insurance news and insights" → "Coverager" for coverager.com. */
export function cleanOutlet(name: string, domain: string): string {
  const parts = name.split(/\s+(?:[|\-–—•:]|::)\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return name.trim();
  return parts.find((p) => matchesDomain(p, domain)) || parts[0];
}

/** Reads publication, headline and date from an article page's HTML. */
export function parsePage(html: string, url: string): PageMeta {
  const nodes = ldNodes(html);
  const art = nodes.find((n) => ARTICLE.test(String(n["@type"] || ""))) || {};
  const pub = (art.publisher || nodes.find((n) => /organization|newsmediaorganization/i.test(String(n["@type"] || "")))) as
    | Ld
    | undefined;
  const pubName = pub && typeof pub === "object" ? decode(String(pub.name || "")) : "";
  const site = meta(html, ["og:site_name", "application-name", "twitter:site"]);
  const titleTag = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "");
  const ogTitle = meta(html, ["og:title", "twitter:title"]);
  const ldHeadline = typeof art.headline === "string" ? decode(art.headline) : "";
  const fromTitle = splitTitle(ogTitle || titleTag || "");

  let outlet = pubName || (site && !site.startsWith("@") ? site : "") || fromTitle.outlet || "";
  // Generic or wrong values sometimes appear in site_name.
  if (/^(home|news|wordpress|index|untitled)$/i.test(outlet)) outlet = fromTitle.outlet || "";
  // A site name written as a web address ("ReinsuranceNe.ws") loses to the
  // publication name in the page title ("… - Reinsurance News").
  if (/^[\w-]+(\.[\w-]+)+$/.test(outlet) && fromTitle.outlet) outlet = fromTitle.outlet;

  let headline: string | null = ldHeadline || splitTitle(ogTitle || titleTag || "").headline || null;
  // A consent or holding page often has only the site's name as its title.
  if (headline && (squash(headline) === squash(outlet) || squash(headline) === squash(site || ""))) headline = null;
  const date = isoDay(String(art.datePublished || "")) ||
    isoDay(meta(html, ["article:published_time", "og:published_time", "datepublished", "date", "dc.date", "pubdate", "publish-date", "sailthru.date", "parsely-pub-date"])) ||
    isoDay(/<time[^>]+datetime\s*=\s*["']([^"']+)["']/i.exec(html)?.[1]) ||
    dateFromUrl(url);
  return { outlet: outlet || null, headline: headline || null, date };
}
