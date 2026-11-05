// Reads each coverage link's page for the publication name, headline and
// publish date (see _shared/pagemeta.ts), so imported coverage is attributed
// to the right outlet and date instead of whatever a spreadsheet column held.
//
// Fallback order per link: the page's own metadata → the " - Publication"
// suffix on the page or spreadsheet headline → the date in the address → for
// outlets still unknown, one AI call naming the publications behind the
// remaining sites → the bare site name.
//
// Input: { urls: string[] (≤ 60), headlines?: { [url]: string } }.
// Output: { ok, items: [{ url, outlet, headline, date, outlet_from }] }.
import { callAnalyst, CORS, domainOf, json, parseJson } from "../_shared/providers.ts";
import { signedIn } from "../_shared/auth.ts";
import { dateFromUrl, parsePage, splitTitle, type PageMeta } from "../_shared/pagemeta.ts";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await signedIn(req))) return json({ ok: false, error: "Sign-in required." }, 401);
  const body = (await req.json().catch(() => ({}))) as { urls?: string[]; headlines?: Record<string, string> };
  const urls = [...new Set((body.urls || []).map((u) => String(u || "").trim()).filter((u) => /^https?:\/\//i.test(u)))]
    .slice(0, MAX);
  if (!urls.length) return json({ ok: true, items: [] });
  const headlines = body.headlines || {};

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

  // One AI call names the publications behind the sites still unknown.
  const unknown = [...new Set(items.filter((x) => !x.outlet).map((x) => domainOf(x.url)).filter(Boolean))];
  if (unknown.length) {
    const out = await callAnalyst(
      "For each website domain below, give the name of the publication or site as its readers " +
        "know it (e.g. reinsurancene.ws → Reinsurance News, iireporter.com → Insurance Innovation " +
        "Reporter, fortune.com → Fortune). If you don't know a domain, give your best reading of its name.\n\n" +
        unknown.join("\n") +
        '\n\nReturn ONLY a JSON object: {"sites":[{"domain":"…","name":"…"}]}',
      2000,
    );
    const parsed = out.error ? null : parseJson<{ sites?: { domain?: string; name?: string }[] }>(out.text);
    const names = new Map(
      (parsed?.sites || []).map((s) => [String(s.domain || "").toLowerCase().replace(/^www\./, ""), String(s.name || "").trim()]),
    );
    for (const it of items) {
      if (it.outlet) continue;
      const d = domainOf(it.url);
      const n = names.get(d);
      if (n) {
        it.outlet = n.slice(0, 80);
        it.outlet_from = "ai";
      } else {
        it.outlet = siteName(d);
        it.outlet_from = "site";
      }
    }
  }
  return json({ ok: true, items });
});
