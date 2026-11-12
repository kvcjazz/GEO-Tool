// Listening: asks every live engine open, category-level questions that the
// client doesn't track, and records where the client gets named and which
// sources the engines cite — plus recent news naming the client.
//
// Measured the measurement-v2 way: the engine is asked the buyer's question
// and nothing else (no brand in the prompt, which primed the old version),
// with its live web search on and located in the client's market. Whether the
// client is named is worked out in code (_shared/measure.ts).
//
// News: Google News RSS (GDELT never connects from Supabase — _shared/news.ts).
//
// Callers: a signed-in user (Listening tab), or the monthly pg_cron job, which
// sends the x-geo-cron header holding the geo_cron_secret Vault secret
// (checked with geo_cron_secret_ok, callable by the service role only).
import {
  callAnalyst,
  callModel,
  CORS,
  domainOf,
  ENGINE_PROVIDER,
  envKey,
  json,
  liveEngines,
  parseStringArray,
} from "../_shared/providers.ts";
import { signedIn } from "../_shared/auth.ts";
import { evidenceFor, names, type Named } from "../_shared/measure.ts";
import { googleNews, orQuery } from "../_shared/news.ts";

const SB = Deno.env.get("SUPABASE_URL");
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const H: Record<string, string> = {
  apikey: SR,
  authorization: "Bearer " + SR,
  "content-type": "application/json",
};

function rest(
  path: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string } = {},
) {
  return fetch(SB + "/rest/v1/" + path, {
    method: opts.method || "GET",
    headers: { ...H, ...(opts.headers || {}) },
    body: opts.body,
  });
}

type Brand = {
  name?: string;
  aliases?: string[] | null;
  sector?: string;
  themes?: string;
  positioning?: string;
  audience?: string;
  pr_persona?: string;
  pr_region?: string;
  market_country?: string | null;
};

type Mention = {
  source: string;
  context: string;
  url: string | null;
  snippet: string;
  sentiment: string;
  theme: string;
  cited: boolean;
  found_date: string;
};

/** The monthly cron job (x-geo-cron matches the Vault secret) or a signed-in user. */
async function allowed(req: Request): Promise<boolean> {
  const sent = req.headers.get("x-geo-cron") || "";
  if (sent) {
    const r = await rest("rpc/geo_cron_secret_ok", {
      method: "POST",
      body: JSON.stringify({ s: sent }),
    });
    if (r.ok && (await r.json()) === true) return true;
  }
  return await signedIn(req);
}

function templateQuestions(b: Brand): string[] {
  const sector = (b.sector || "companies").trim();
  const region = (b.pr_region || "").trim();
  const aud = (b.pr_persona || b.audience || "buyers").trim();
  const themes = String(b.themes || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const inR = region ? " in " + region : "";
  const ps: string[] = [];
  ps.push("Who are the leading " + sector + inR + "?");
  if (themes[0]) ps.push("Which companies are best known for " + themes[0] + "?");
  if (themes[1]) ps.push("Who are the top providers working on " + themes[1] + "?");
  ps.push("What are the best " + sector + " for " + aud + "?");
  ps.push("Name notable " + sector + inR + " and what each is known for.");
  return ps.slice(0, 6);
}

async function makeQuestions(b: Brand, bid: string): Promise<string[]> {
  const prompt = 'A company called "' + b.name + '" operates in this space. Sector: ' +
    (b.sector || "") + ". Themes: " + (b.themes || "") + ". Positioning: " +
    (b.positioning || "") + ". Audience: " + (b.pr_persona || b.audience || "") +
    ". Market: " + (b.pr_region || "") +
    ". Write 6 open, category-level questions a buyer would ask an AI assistant, in the " +
    "words they'd really use, that could naturally lead the AI to name real companies in " +
    "this exact space and market. Be specific to the real category (name the precise " +
    'field or sub-sector), NOT generic. Do NOT mention "' + b.name + '" in any question. ' +
    "Return ONLY a JSON array of 6 question strings.";
  const out = await callAnalyst(prompt, 800, { fn: "geo-listen", purpose: "listen-questions", brandId: bid });
  const arr = parseStringArray(out.text);
  if (arr && arr.length >= 3) return arr.slice(0, 6);
  return templateQuestions(b);
}

async function news(b: Brand, today: string): Promise<{ rows: Mention[]; error?: string }> {
  const themes = String(b.themes || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const name = orQuery([b.name, ...(b.aliases || [])], 4);
  const disamb = themes.length ? " " + orQuery(themes, 5) : "";
  let res = await googleNews(name + disamb, { country: b.market_country, days: 30, max: 25 });
  if (res.articles.length < 2) {
    const wide = await googleNews(name, { country: b.market_country, days: 30, max: 25 });
    if (wide.articles.length > res.articles.length) res = wide;
  }
  return {
    error: res.error,
    rows: res.articles.map((a) => ({
      source: a.domain || "news",
      context: "News / web mention",
      url: a.url,
      snippet: a.title,
      sentiment: "Neutral",
      theme: "",
      cited: false,
      found_date: (a.seendate || today).slice(0, 10),
    })),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await allowed(req))) return json({ ok: false, error: "Sign-in required." }, 401);

  const body = await req.json().catch(() => ({})) as { brand_id?: string };
  const bid = body.brand_id;
  if (!bid || !/^[0-9a-f-]{36}$/i.test(bid)) return json({ ok: false, error: "brand_id required" });

  try {
    const brand = (await (await rest(`geo_brands?id=eq.${bid}&select=*`)).json())[0] as
      | Brand
      | undefined;
    if (!brand?.name) return json({ ok: false, error: "brand not found" });

    const today = new Date().toISOString().slice(0, 10);
    const engines = liveEngines();
    if (!engines.length) return json({ ok: false, error: "no_keys" });

    const questions = await makeQuestions(brand, bid);
    const who: Named = { name: brand.name, aliases: brand.aliases || [] };

    // Every engine × question side by side: searched answers are slow.
    const jobs = engines.flatMap((engine) => questions.map((q) => ({ engine, q })));
    const results = await Promise.all(
      jobs.map(async ({ engine, q }) => {
        const provider = ENGINE_PROVIDER[engine];
        const key = envKey(provider);
        if (!key) return { engine, q, error: "no key", rows: [] as Mention[] };
        const out = await callModel(provider, key, q, 3000, {
          webSearch: true,
          country: brand.market_country,
          usage: { fn: "geo-listen", purpose: "listen-answer", brandId: bid },
        });
        if (out.error) return { engine, q, error: out.error, rows: [] as Mention[] };
        const rows: Mention[] = [];
        if (names(out.text, who)) {
          rows.push({
            source: engine,
            context: q,
            url: null,
            snippet: evidenceFor(out.text, who),
            sentiment: "Neutral",
            theme: "",
            cited: false,
            found_date: today,
          });
        }
        for (const c of [...new Set(out.citations)]) {
          const d = domainOf(c);
          if (!d) continue;
          rows.push({
            source: engine + " · " + d,
            context: "Live source cited for: " + q,
            url: c,
            snippet: "Cited as a source by " + engine + " when discussing this topic.",
            sentiment: "Neutral",
            theme: "",
            cited: true,
            found_date: today,
          });
        }
        return { engine, q, error: "", rows };
      }),
    );
    const found: Mention[] = results.flatMap((r) => r.rows);
    const errors = [...new Set(results.filter((r) => r.error).map((r) => `${r.engine}: ${r.error}`))];

    const nw = await news(brand, today);
    found.push(...nw.rows);
    if (nw.error) errors.push(nw.error);

    const existing = await (await rest(
      `geo_mentions?brand_id=eq.${bid}&select=source,snippet,url`,
    )).json() as { source?: string; snippet?: string; url?: string }[];

    const norm = (s: unknown) =>
      String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
    const keyOf = (m: { url?: string | null; source?: string; snippet?: string }) =>
      m.url ? "u:" + m.url : "s:" + norm(m.source) + "|" + norm(m.snippet);

    const seen = new Set((existing || []).map(keyOf));
    const rows: Record<string, unknown>[] = [];
    for (const m of found) {
      const k = keyOf(m);
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push({ brand_id: bid, ...m });
    }
    if (rows.length) {
      await rest("geo_mentions", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(rows),
      });
    }

    return json({
      ok: true,
      scanned: jobs.length,
      found: found.length,
      inserted: rows.length,
      newsCount: nw.rows.length,
      engines,
      questions,
      errors: errors.slice(0, 10),
    });
  } catch (e) {
    return json({ ok: false, error: String(e) });
  }
});
