// Creates a fresh monthly run and measures every active prompt across every
// live engine. Called from the UI ("New snapshot") and from the monthly cron.
//
// The engines for a prompt are queried in parallel — they hit different
// providers, and running them serially made a full snapshot slow enough to risk
// the edge-function wall clock once all six engines are live again.
import {
  CORS,
  ENGINE_PROVIDER,
  json,
  KEY_ENV,
  liveEngines,
  PROVIDERS,
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

type RunOutcome = {
  engine: string;
  row?: Record<string, unknown>;
  error?: string;
};

async function runOne(
  engine: string,
  prompt: { id: string; text: string },
  brandName: string,
  competitors: string[],
  samples: number,
): Promise<RunOutcome> {
  try {
    const r = await fetch(SB + "/functions/v1/geo-run", {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        engine,
        prompt: prompt.text,
        brand: brandName,
        competitors,
        samples,
      }),
    });
    const j = await r.json() as {
      ok?: boolean;
      error?: string;
      detail?: string;
      result?: Record<string, unknown>;
    };
    if (!j.ok || !j.result) {
      return {
        engine,
        error: `${engine}: ${j.error || "run failed"}${j.detail ? " — " + j.detail : ""}`,
      };
    }
    const o = j.result as Record<string, string | number | boolean | null>;
    return {
      engine,
      row: {
        prompt_id: prompt.id,
        engine,
        mentioned: !!o.mentioned,
        prominence: o.prominence || "Absent",
        sentiment: o.sentiment || null,
        accuracy: o.accuracy || null,
        cited: o.cited || "n/a",
        competitor_mentions: Number(o.competitor_mentions) || 0,
        evidence: o.evidence || null,
        cited_sources: o.cited_sources || null,
        samples: o.samples || samples,
        mention_rate: o.mention_rate != null ? o.mention_rate : null,
        confidence: o.confidence || null,
      },
    };
  } catch (e) {
    return { engine, error: `${engine}: ${String(e)}` };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const body = await req.json().catch(() => ({})) as {
    brand_id?: string;
    samples?: number;
    max_prompts?: number;
  };
  const bid = body.brand_id;
  if (!bid) return json({ ok: false, error: "brand_id required" });

  const samples = Math.max(1, Math.min(5, Number(body.samples) || 3));
  const cap = Math.max(1, Math.min(40, Number(body.max_prompts) || 20));

  const engines = liveEngines();
  if (!engines.length) {
    // Previously this silently fell back to Claude, which is exactly how the
    // tool ended up reporting Claude-only results as if they were complete.
    return json({
      ok: false,
      error: "no_keys",
      detail: "No provider API keys are set. Add one of: " +
        PROVIDERS.map((p) => KEY_ENV[p]).join(", "),
    });
  }

  try {
    const brands = await (await rest(`geo_brands?id=eq.${bid}&select=id,name`)).json();
    const brand = brands[0];
    if (!brand) return json({ ok: false, error: "brand not found" });

    const prompts = await (await rest(
      `geo_prompts?brand_id=eq.${bid}&active=eq.true&order=sort&select=id,text`,
    )).json() as { id: string; text: string }[];

    const competitors = (await (await rest(
      `geo_competitors?brand_id=eq.${bid}&select=name`,
    )).json() as { name: string }[]).map((c) => c.name);

    const now = new Date();
    const label = now.toISOString().slice(0, 7) + " (Current)";
    await rest(`geo_runs?brand_id=eq.${bid}&is_current=eq.true`, {
      method: "PATCH",
      body: JSON.stringify({ is_current: false }),
    });
    const run = (await (await rest("geo_runs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        brand_id: bid,
        label,
        run_date: now.toISOString().slice(0, 10),
        is_current: true,
      }),
    })).json())[0];

    const use = prompts.slice(0, cap);
    const errors: string[] = [];
    let made = 0;

    for (const p of use) {
      const outcomes = await Promise.all(
        engines.map((eng) => runOne(eng, p, brand.name, competitors, samples)),
      );
      const rows = outcomes
        .filter((o) => o.row)
        .map((o) => ({ run_id: run.id, ...o.row }));
      for (const o of outcomes) if (o.error) errors.push(o.error);
      if (rows.length) {
        await rest("geo_responses", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(rows),
        });
        made += rows.length;
      }
    }

    // Which engines produced nothing at all — the signal that used to be lost.
    const failedEngines = engines.filter((e) =>
      errors.some((msg) => msg.startsWith(e + ":"))
    );

    return json({
      ok: true,
      run_id: run.id,
      label,
      prompts: use.length,
      engines,
      providers: engines.map((e) => ENGINE_PROVIDER[e]),
      responses: made,
      failed_engines: failedEngines,
      errors: errors.slice(0, 10),
    });
  } catch (e) {
    return json({ ok: false, error: String(e) });
  }
});
