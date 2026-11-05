import { host } from "./format";
import { isArticleUrl, normUrl } from "./prImpact";
import type { PrActivity } from "./types";

// Turns a coverage spreadsheet into PR placements. Only the article link is
// required; everything else is optional and recognised under the column names
// teams actually use ("Link", "Publication", "Date published", …).

export type ImportRow = {
  line: number;
  url: string;
  activity_date: string;
  outlet: string;
  theme: string | null;
  tier: string;
  atype: string;
  /** Problems that stop the row importing. */
  errors: string[];
  /** Things filled in or worth checking. */
  notes: string[];
  duplicate: boolean;
};

const HEADERS: Record<string, string[]> = {
  url: ["url", "link", "article", "article url", "article link", "coverage", "coverage link", "coverage url", "web link", "source url"],
  date: ["date", "published", "date published", "publish date", "publication date", "coverage date", "live date"],
  outlet: ["outlet", "publication", "media", "media outlet", "title", "site", "source", "publisher"],
  theme: ["theme", "topic", "subject", "headline", "story", "angle", "campaign"],
  tier: ["tier", "outlet tier", "media tier"],
  type: ["type", "coverage type", "category", "format"],
};

const TYPES = ["Earned coverage", "Review/Listing", "Community", "Owned"];

function norm(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Index of each known field in the header row (−1 when absent). */
export function mapHeaders(header: string[]): Record<keyof typeof HEADERS, number> {
  const h = header.map(norm);
  const out = {} as Record<keyof typeof HEADERS, number>;
  for (const [field, names] of Object.entries(HEADERS)) {
    out[field as keyof typeof HEADERS] = h.findIndex((x) => names.includes(x));
  }
  return out;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * ISO date from the formats coverage sheets use. Slashed dates are read
 * day-first (UK), unless the first number can't be a day. Excel serial
 * numbers are accepted too. Null when unreadable.
 */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  const pad = (n: number) => String(n).padStart(2, "0");
  const make = (y: number, m: number, d: number) => {
    if (y < 100) y += 2000;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
  };
  if (iso) return make(+iso[1], +iso[2], +iso[3]);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (dmy) {
    const a = +dmy[1];
    const b = +dmy[2];
    return a > 12 || b <= 12 ? make(+dmy[3], b, a) : make(+dmy[3], a, b);
  }
  const named = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\.?,?\s+(\d{2,4})$/i.exec(s);
  if (named) {
    const m = MONTHS.indexOf(named[2].toLowerCase());
    if (m >= 0) return make(+named[3], m + 1, +named[1]);
  }
  const named2 = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})$/i.exec(s);
  if (named2) {
    const m = MONTHS.indexOf(named2[1].toLowerCase());
    if (m >= 0) return make(+named2[3], m + 1, +named2[2]);
  }
  if (/^\d{5}$/.test(s)) {
    // Excel serial date (days since 1899-12-30).
    const dt = new Date(Date.UTC(1899, 11, 30) + +s * 86_400_000);
    return dt.toISOString().slice(0, 10);
  }
  return null;
}

export function parseTier(raw: string): string {
  const m = /([123])/.exec(raw || "");
  return m ? `Tier ${m[1]}` : "Tier 2";
}

function parseType(raw: string): string {
  const t = (raw || "").toLowerCase();
  if (/review|listing|directory|rank/.test(t)) return "Review/Listing";
  if (/community|forum|reddit|social/.test(t)) return "Community";
  if (/owned|blog|own site/.test(t)) return "Owned";
  return TYPES[0];
}

/** "techround.co.uk" → "Techround"; good enough until the team edits it. */
function outletFromDomain(d: string): string {
  const base = d.split(".")[0] || d;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Readable words from an article's address, as a fallback theme. */
function themeFromSlug(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const slug = [...parts].reverse().find((p) => /[a-z].*-.*[a-z]/i.test(p));
    if (!slug) return null;
    const words = decodeURIComponent(slug)
      .replace(/\.(html?|php|aspx?)$/i, "")
      .split(/[-_]+/)
      .filter((w) => w && !/^\d+$/.test(w));
    return words.length >= 2 ? words.join(" ").slice(0, 80) : null;
  } catch {
    return null;
  }
}

export function buildImport(
  rows: string[][],
  existing: Pick<PrActivity, "url">[],
  today: string,
): { rows: ImportRow[]; headerFound: boolean } {
  if (!rows.length) return { rows: [], headerFound: false };
  let cols = mapHeaders(rows[0]);
  let body = rows.slice(1);
  let headerFound = cols.url >= 0;
  let headerless = false;
  if (!headerFound && /^https?:\/\//i.test((rows[0][0] || "").trim())) {
    // No header: a plain list of links.
    cols = { url: 0, date: -1, outlet: -1, theme: -1, tier: -1, type: -1 };
    body = rows;
    headerFound = true;
    headerless = true;
  }
  if (!headerFound) return { rows: [], headerFound: false };

  const have = new Set(existing.map((p) => normUrl(p.url || "")).filter(Boolean));
  const seen = new Set<string>();
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] || "").trim() : "");

  const out = body.map((r, i): ImportRow => {
    const errors: string[] = [];
    const notes: string[] = [];
    let url = get(r, cols.url);
    if (url && !/^https?:\/\//i.test(url) && /^[\w-]+(\.[\w-]+)+/.test(url)) url = "https://" + url;
    let valid = false;
    try {
      valid = !!url && !!new URL(url).hostname.includes(".");
    } catch {
      valid = false;
    }
    if (!valid) errors.push(url ? "Not a valid link" : "No link");
    else if (!isArticleUrl(url)) notes.push("Home-page link: AI citations can only be matched to the outlet");

    const rawDate = get(r, cols.date);
    let date = parseDate(rawDate);
    if (!date) {
      if (rawDate) errors.push(`Unreadable date “${rawDate}”`);
      else {
        date = today;
        notes.push("No date: used today");
      }
    } else if (date > today) notes.push("Date is in the future");

    let outlet = get(r, cols.outlet);
    if (!outlet && valid) {
      outlet = outletFromDomain(host(url));
      notes.push("Outlet taken from the link");
    }
    let theme: string | null = get(r, cols.theme) || null;
    if (!theme && valid) {
      theme = themeFromSlug(url);
      if (theme) notes.push("Theme taken from the link");
    }

    const key = valid ? normUrl(url) : "";
    const duplicate = !!key && (have.has(key) || seen.has(key));
    if (key) seen.add(key);

    return {
      // Spreadsheet line number, so the team can find the row.
      line: i + (headerless ? 1 : 2),
      url,
      activity_date: date || "",
      outlet,
      theme,
      tier: parseTier(get(r, cols.tier)),
      atype: parseType(get(r, cols.type)),
      errors,
      notes,
      duplicate,
    };
  });
  return { rows: out, headerFound };
}

export const TEMPLATE_HEADER = ["url", "date", "outlet", "theme", "tier", "type"];
