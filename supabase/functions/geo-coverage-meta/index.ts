// Reads each coverage link's page for the publication name, headline and
// publish date (see _shared/pagemeta.ts), so imported coverage is attributed
// to the right outlet and date instead of whatever a spreadsheet column held.
//
// Fallback order per link: the page's own metadata → the " - Publication"
// suffix on the page or spreadsheet headline → the date in the address → for
// outlets still unknown, one AI call naming the publications behind the
// remaining sites → the bare site name.
//
// Two modes:
//   { urls: string[] (≤ 60), headlines?: { [url]: string } }
//     → { ok, items: [{ url, outlet, headline, date, outlet_from }] }   (lookup only)
//   { brand_id, repair: true }
//     → re-reads every placement of that client and fixes, in the database,
//       publication names that are really headlines or guesses, missing
//       headlines, and dates that were only the day the piece was logged
//       (_shared/coverage.ts decides). Returns what it changed.
// Callers: a signed-in user (lookups), a signed-in user who can edit the
// client or the cron secret (repair). verify_jwt is off so the cron secret
// works; every path checks auth itself.
import { callAnalyst, CORS, domainOf, json, parseJson } from "../_shared/providers.ts";
import { signedIn } from "../_shared/auth.ts";
import {
  cleanOutlet,
  dateFromUrl,
  matchesDomain,
  parsePage,
  splitTitle,
  type PageMeta,
} from "../_shared/pagemeta.ts";
import { repairPatch, type Placement } from "../_shared/coverage.ts";

type Item = PageMeta & { url: string; outlet_from: "page" | "headline" | "ai" | "site" };

const MAX = 60;
const PARALLEL = 8;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/130.0 Safari/537.36 LuminousGEO-coverage-check";

async function fetchPage(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok || !/html/i.test(r.headers.get("content-type") || "html")) {
      await r.body?.cancel();
      return null;
    }
    // The metadata lives in <head>; don't read megabytes of page.
    const reader = r.body?.getReader();
    if (!reader) return null;
    let html = "";
    const dec = new TextDecoder();
    while (html.length < 400_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html) && html.length > 20_000) break;
    }
    await reader.cancel().catch(() => {});
    return html;
  } catch {
    return null;
  }
}

function siteName(domain: string): string {
  const base = domain.split(".")[0] || domain;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

const SB = Deno.env.get("SUPABASE_URL") || "";
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function rest(path: string, init: { method?: string; body?: unknown; auth?: string; apikey?: string } = {}) {
  return fetch(SB + "/rest/v1/" + path, {
    method: init.method || "GET",
    headers: {
      apikey: init.apikey || SR,
      authorization: init.auth || "Bearer " + SR,
      "content-type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

/** Cron secret, or a signed-in user allowed to edit this client. */
async function canRepair(req: Request, bid: string): Promise<boolean> {
  const sent = req.headers.get("x-geo-cron") || "";
  if (sent) {
    const r = await rest("rpc/geo_cron_secret_ok", { method: "POST", body: { s: sent } });
    if (r.ok && (await r.json()) === true) return true;
  }
  if (!(await signedIn(req))) return false;
  const r = await rest("rpc/geo_can_edit_brand", {
    method: "POST",
    body: { bid },
    auth: req.headers.get("authorization") || "",
    apikey: req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "",
  });
  return r.ok && (await r.json()) === true;
}

/** Publication, headline and date for each link (page → headline suffix → AI → site name). */
async function resolve(
  urls: string[],
  headlines: Record<string, string>,
  brandId?: string | null,
): Promise<Item[]> {
  const items: Item[] = new Array(urls.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, urls.length) }, async () => {
      while (next < urls.length) {
        const i = next++;
        const url = urls[i];
        const html = await fetchPage(url);
        const fromPage = html ? parsePage(html, url) : { outlet: null, headline: null, date: dateFromUrl(url) };
        const sheet = headlines[url] ? splitTitle(headlines[url]) : null;
        let outlet_from: Item["outlet_from"] = "page";
        let outlet = fromPage.outlet;
        if (!outlet && sheet?.outlet) {
          outlet = sheet.outlet;
          outlet_from = "headline";
        }
        if (outlet) outlet = cleanOutlet(outlet, domainOf(url));
        items[i] = {
          url,
          outlet,
          headline: fromPage.headline || sheet?.headline || null,
          date: fromPage.date,
          outlet_from,
        };
      }
    }),
  );

  // One AI call names the publications behind the sites still unknown, and
  // behind sites whose page names a different brand (a parent company).
  const doubtful = (x: Item) => !x.outlet || !matchesDomain(x.outlet, domainOf(x.url));
  const unknown = [...new Set(items.filter(doubtful).map((x) => domainOf(x.url)).filter(Boolean))];
  if (unknown.length) {
    const out = await callAnalyst(
      "For each website domain below, give the name of the publication or site as its readers " +
        "know it (e.g. reinsurancene.ws → Reinsurance News, iireporter.com → Insurance Innovation " +
        "Reporter, fortune.com → Fortune). If you don't know a domain, give your best reading of its name.\n\n" +
        unknown.join("\n") +
        '\n\nReturn ONLY a JSON object: {"sites":[{"domain":"…","name":"…"}]}',
      2000,
      { fn: "geo-coverage-meta", purpose: "publication-names", brandId },
    );
    const parsed = out.error ? null : parseJson<{ sites?: { domain?: string; name?: string }[] }>(out.text);
    const names = new Map(
      (parsed?.sites || []).map((s) => [String(s.domain || "").toLowerCase().replace(/^www\./, ""), String(s.name || "").trim()]),
    );
    for (const it of items) {
      if (!doubtful(it)) continue;
      const d = domainOf(it.url);
      const n = names.get(d);
      if (it.outlet) {
        // Replace a mismatching page name only with one that fits the site.
        if (n && matchesDomain(n, d)) {
          it.outlet = n.slice(0, 80);
          it.outlet_from = "ai";
        }
      } else if (n) {
        it.outlet = n.slice(0, 80);
        it.outlet_from = "ai";
      } else {
        it.outlet = siteName(d);
        it.outlet_from = "site";
      }
    }
  }
  return items;
}

async function repair(bid: string): Promise<Response> {
  const res = await rest(
    `geo_pr_activity?brand_id=eq.${bid}&url=not.is.null&select=id,url,outlet,headline,activity_date,created_at&order=created_at.desc&limit=200`,
  );
  const rows = (res.ok ? await res.json() : []) as Placement[];
  const fixed = { outlet: 0, headline: 0, date: 0, rows: 0 };
  const changes: { id: string; before: string; after: string }[] = [];
  for (let i = 0; i < rows.length; i += MAX) {
    const chunk = rows.slice(i, i + MAX);
    const found = await resolve(
      chunk.map((p) => p.url!),
      Object.fromEntries(chunk.map((p) => [p.url!, p.headline || p.outlet])),
      bid,
    );
    const byUrl = new Map(found.map((f) => [f.url, f]));
    for (const p of chunk) {
      const patch = repairPatch(p, byUrl.get(p.url!));
      if (!patch) continue;
      const w = await rest(`geo_pr_activity?id=eq.${p.id}`, { method: "PATCH", body: patch });
      if (!w.ok) continue;
      fixed.rows++;
      if (patch.outlet) {
        fixed.outlet++;
        changes.push({ id: p.id, before: p.outlet, after: patch.outlet });
      }
      if (patch.headline) fixed.headline++;
      if (patch.activity_date) fixed.date++;
    }
  }
  return json({ ok: true, checked: rows.length, fixed, changes: changes.slice(0, 100) });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const body = (await req.json().catch(() => ({}))) as {
    urls?: string[];
    headlines?: Record<string, string>;
    brand_id?: string;
    repair?: boolean;
  };

  if (body.repair) {
    const bid = String(body.brand_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(bid)) return json({ ok: false, error: "brand_id required" }, 400);
    if (!(await canRepair(req, bid))) return json({ ok: false, error: "Not allowed." }, 401);
    return repair(bid);
  }

  if (!(await signedIn(req))) return json({ ok: false, error: "Sign-in required." }, 401);
  const urls = [...new Set((body.urls || []).map((u) => String(u || "").trim()).filter((u) => /^https?:\/\//i.test(u)))]
    .slice(0, MAX);
  if (!urls.length) return json({ ok: true, items: [] });
  return json({ ok: true, items: await resolve(urls, body.headlines || {}, body.brand_id) });
});
