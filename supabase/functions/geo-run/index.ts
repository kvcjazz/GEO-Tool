// Measures one prompt against one engine, sampling it N times and reducing the
// samples to a single scored row plus a confidence rating.
//
// Failure reporting matters as much as the measurement here: when a provider
// call fails the reason is returned verbatim (`detail`), because a silent
// failure is what let the tool quietly degrade to Claude-only.
import {
  callModel,
  CORS,
  domainOf,
  envKey,
  json,
  KEY_ENV,
  parseJson,
  providerFor,
} from "../_shared/providers.ts";

type Sample = {
  answer?: string;
  mentioned?: boolean;
  prominence?: string;
  sentiment?: string;
  accuracy?: string;
  cited?: string;
  competitor_mentions?: number | string;
  evidence?: string;
  cited_sources?: string;
};

function mode(values: (string | null | undefined)[]): string | null {
  const counts: Record<string, number> = {};
  let best: string | null = null;
  let bestCount = 0;
  for (const v of values) {
    if (v == null || v === "") continue;
    counts[v] = (counts[v] || 0) + 1;
    if (counts[v] > bestCount) {
      bestCount = counts[v];
      best = v;
    }
  }
  return best;
}

function buildPrompt(
  question: string,
  brand: string,
  competitors: string,
): string {
  return (
    'You are answering as a helpful AI assistant. A user asked: "' +
    question +
    '".\nFirst answer the question naturally in 2-4 sentences as you normally would.\n' +
    'Then assess your OWN answer with respect to the brand "' +
    brand +
    '" and return a SINGLE JSON object only (no code fences) with keys: ' +
    "answer (your answer text), mentioned (true or false: did you name the brand), " +
    "prominence (one of Recommended, Prominent, Passing, Absent), " +
    "sentiment (Positive, Neutral, Negative), accuracy (Correct, Minor error, Major error), " +
    "cited (Yes or No: did you point to sources), " +
    "competitor_mentions (integer count of these competitors you named: " +
    competitors +
    "), evidence (a short quote from your answer mentioning the brand, or empty), " +
    "cited_sources (comma-separated domains you relied on, or empty). " +
    "Return ONLY the JSON object."
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const body = await req.json().catch(() => ({})) as {
    engine?: string;
    prompt?: string;
    brand?: string;
    competitors?: string[];
    samples?: number;
  };

  const engine = body.engine || "Claude";
  const provider = providerFor(engine);
  if (!provider) return json({ ok: false, error: "unsupported", engine });

  const key = envKey(provider);
  if (!key) {
    return json({
      ok: false,
      error: "no_key",
      engine,
      provider,
      detail: "Missing edge-function secret " + KEY_ENV[provider],
    });
  }

  const competitors = (body.competitors || []).join(", ");
  const samples = Math.max(1, Math.min(5, Number(body.samples) || 3));
  const prompt = buildPrompt(body.prompt || "", body.brand || "", competitors);

  const results: Sample[] = [];
  const allCites: string[] = [];
  const errors: string[] = [];
  let model = "";

  for (let i = 0; i < samples; i++) {
    const out = await callModel(provider, key, prompt);
    if (out.model) model = out.model;
    if (out.error) {
      errors.push(out.error);
      // A key/model level failure repeats on every sample — stop burning calls.
      break;
    }
    for (const c of out.citations) {
      const d = domainOf(c);
      if (d) allCites.push(d);
    }
    const parsed = parseJson<Sample>(out.text);
    if (parsed) results.push(parsed);
    else errors.push(model + " → reply was not valid JSON");
  }

  if (!results.length) {
    return json({
      ok: false,
      error: "call_failed",
      engine,
      provider,
      model,
      detail: errors[0] || "no usable response",
    });
  }

  const mentions = results.map((o) => (o.mentioned ? 1 : 0));
  const mrate = mentions.reduce((a, b) => a + b, 0) / mentions.length;
  const mentioned = results.filter((o) => o.mentioned);

  const prom = mode(results.map((o) => o.prominence)) ||
    (mrate >= 0.5 ? "Passing" : "Absent");
  const sent = mode(mentioned.map((o) => o.sentiment));
  const acc = mode(mentioned.map((o) => o.accuracy));
  const cited = mode(results.map((o) => o.cited)) || "n/a";
  const cm = Math.round(
    results.map((o) => Number(o.competitor_mentions) || 0).reduce((a, b) => a + b, 0) /
      results.length,
  );

  const withEvidence = results.filter((o) => o.mentioned && o.evidence);
  const evidence = withEvidence[0]?.evidence || results[0]?.evidence || "";

  const srcSet = new Set<string>();
  for (const o of results) {
    for (const s of String(o.cited_sources || "").split(/[,;]/)) {
      const v = s.trim().toLowerCase();
      if (v) srcSet.add(v);
    }
  }
  for (const d of allCites) srcSet.add(d);

  const agreeMentions = mentions.every((v) => v === mentions[0]);
  const agreeProminence = results.every((o) => o.prominence === results[0].prominence);
  const confidence = agreeMentions && agreeProminence
    ? "High"
    : mrate <= 0.2 || mrate >= 0.8
    ? "Medium"
    : "Low";

  return json({
    ok: true,
    engine,
    provider,
    model,
    result: {
      answer: results[0].answer || "",
      mentioned: mrate >= 0.5,
      mention_rate: Math.round(mrate * 100) / 100,
      prominence: prom,
      sentiment: sent,
      accuracy: acc,
      cited,
      competitor_mentions: cm,
      evidence,
      cited_sources: Array.from(srcSet).join(", "),
      samples: results.length,
      confidence,
    },
    // Partial trouble (e.g. one unparseable sample) still returns ok:true.
    warnings: errors.length ? errors.slice(0, 3) : undefined,
  });
});
