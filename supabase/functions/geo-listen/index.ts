// Listening: asks every live engine a set of category-level questions and
// records where the brand gets named, alongside GDELT news mentions.
//
// Shares the provider client with geo-run, so it picks up the same model
// fallback chain and the same surfaced provider errors.
import {
  callModel,
  CORS,
  domainOf,
  ENGINE_PROVIDER,
  envKey,
  json,
  liveEngines,
  parseJson,
  parseStringArray,
  type ProviderId,
} from "../_shared/providers.ts";

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
  sector?: string;
  themes?: string;
  positioning?: string;
  audience?: string;
  pr_persona?: string;
  pr_region?: string;
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

function quo(t: string): string {
  return /\s/.test(t) ? '"' + t + '"' : t;
}

function templateQuestions(b: Brand): string[] {
  const sector = (b.sector || "companies").trim();
  const region = (b.pr_region || "").trim();
  const aud = (b.pr_persona || b.audience || "buyers").trim();
  const themes = String(b.themes || "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const inR = region ? " in " + region : "";
  const ps: string[] = [];
  ps.push("Who are the leading " + sector + inR + "?");
  if (themes[0]) ps.push("Which companies are best known for " + themes[0] + "?");
  if (themes[1]) ps.push("Who are the top providers working on " + themes[1] + "?");
  ps.push("What are the best " + sector + " for " + aud + "?");
  ps.push("Name notable " + sector + inR + " and what each is known for.");
  return ps.slice(0, 6);
}

async function makeQuestions(b: Brand, provider: ProviderId | null): Promise<string[]> {
  if (!provider) return templateQuestions(b);
  const key = envKey(provider);
  if (!key) return templateQuestions(b);
  const prompt = 'A company called "' + b.name + '" operates in this space. Sector: ' +
    (b.sector || "") + ". Themes: " + (b.themes || "") + ". Positioning: " +
    (b.positioning || "") + ". Audience: " + (b.pr_persona || b.audience || "") +
    ". Region: " + (b.pr_region || "") +
    ". Write 6 open, category-level questions a buyer, developer or enthusiast would " +
    "ask an AI assistant that could naturally lead the AI to name real companies in " +
    "this exact space. Be specific to the real category and technology (name the " +
    "precise field, e.g. the specific technology or sub-sector), NOT generic. Do NOT " +
    'mention "' + b.name + '" in any question. Return ONLY a JSON array of 6 question strings.';
  const out = await callModel(provider, key, prompt, 800);
  const arr = parseStringArray(out.text);
  if (arr && arr.length >= 3) return arr.slice(0, 6);
  return templateQuestions(b);
}

function ymd(s: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(s || "");
  return m ? `${m[1]}-${m[2]}-${m[3]}` : new Date().toISOString().slice(0, 10);
}

async function gdeltRaw(q: string): Promise<Mention[]> {
  const url = "https://api.gdeltproject.org/api/v2/doc/doc?query=" +
    encodeURIComponent(q) +
    "&mode=ArtList&format=json&maxrecords=25&timespan=30d&sort=DateDesc";
  try {
    const r = await fetch(url, { headers: { "User-Agent": "LuminousGEO/1.0" } });
    const t = await r.text();
    let j: { articles?: Record<string, string>[] };
    try {
      j = JSON.parse(t);
    } catch {
      return [];
    }
    return (j.articles || [])
      .map((x) => ({
        source: x.domain || "news",
        context: "News / web mention",
        url: x.url || x.url_mobile || "",
        snippet: x.title || "",
        sentiment: "Neutral",
        theme: "",
        cited: false,
        found_date: ymd(x.seendate),
      }))
      .filter((x) => x.snippet && x.url);
  } catch {
    return [];
  }
}

async function news(b: Brand): Promise<Mention[]> {
  const themes = String(b.themes || "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);
  const disamb = themes.length ? " (" + themes.map(quo).join(" OR ") + ")" : "";
  const out = await gdeltRaw(quo(String(b.name)) + disamb + " sourcelang:english");
  if (out.length < 2) {
    const seen = new Set(out.map((x) => x.url));
    for (const x of await gdeltRaw(quo(String(b.name)) + " sourcelang:english")) {
      if (!seen.has(x.url)) out.push(x);
    }
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const body = await req.json().catch(() => ({})) as { brand_id?: string };
  const bid = body.brand_id;
  if (!bid) return json({ ok: false, error: "brand_id required" });

  try {
    const brand = (await (await rest(`geo_brands?id=eq.${bid}&select=*`)).json())[0] as
      | Brand
      | undefined;
    if (!brand) return json({ ok: false, error: "brand not found" });

    const today = new Date().toISOString().slice(0, 10);
    const engines = liveEngines();
    if (!engines.length) return json({ ok: false, error: "no_keys" });

    // Prefer Claude for question generation, else whichever engine is live.
    const questionProvider = envKey("anthropic")
      ? "anthropic" as ProviderId
      : ENGINE_PROVIDER[engines[0]];
    const questions = await makeQuestions(brand, questionProvider);

    const found: Mention[] = [];
    const errors: string[] = [];
    let scanned = 0;
    const nameLc = String(brand.name || "").toLowerCase();

    for (const engine of engines) {
      const provider = ENGINE_PROVIDER[engine];
      const key = envKey(provider);
      if (!key) continue;
      for (const q of questions) {
        scanned++;
        const ask =
          "You are a helpful AI assistant with knowledge of this sector. Answer this " +
          'question naturally and specifically, naming real companies where relevant ' +
          '(4-6 sentences): "' + q + '".\nThen assess whether your answer named the ' +
          'company "' + brand.name + '". Return ONLY a JSON object. If you did NOT name ' +
          'it, return {"mentioned":false}. If you DID, return {"mentioned":true,' +
          '"sentiment":"Positive|Neutral|Negative","cited":"Yes|No","snippet":"a short ' +
          'quote from your answer that names the company","theme":"one or two words"}.';

        const out = await callModel(provider, key, ask, 800);
        if (out.error) {
          errors.push(`${engine}: ${out.error}`);
          break; // this engine is broken for every question
        }
        const o = parseJson<{
          mentioned?: boolean;
          sentiment?: string;
          cited?: string;
          snippet?: string;
          theme?: string;
        }>(out.text);
        const named = !!o?.mentioned &&
          (String(o.snippet || "").toLowerCase().includes(nameLc) ||
            String(out.text || "").toLowerCase().includes(nameLc));
        if (named) {
          found.push({
            source: engine,
            context: q,
            url: null,
            snippet: (o!.snippet || "").slice(0, 400),
            sentiment: o!.sentiment || "Neutral",
            theme: (o!.theme || "").slice(0, 40),
            cited: o!.cited === "Yes",
            found_date: today,
          });
        }
        for (const c of out.citations) {
          const d = domainOf(c);
          if (!d) continue;
          found.push({
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
      }
    }

    const nw = await news(brand);
    found.push(...nw);

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
      scanned,
      found: found.length,
      inserted: rows.length,
      newsCount: nw.length,
      engines,
      questions,
      errors: errors.slice(0, 10),
    });
  } catch (e) {
    return json({ ok: false, error: String(e) });
  }
});
