// Measurement v2: measures one prompt against one engine, the way a real user
// would meet it.
//
// What changed from geo-run (v1), and why:
//   1. The engine is asked the buyer's question and nothing else — no brand
//      name, no length limit, no instructions to grade itself. v1 named the
//      brand in the same message, which primes the answer.
//   2. Web search is on wherever the provider offers it, so answers and their
//      citations match what users of that engine actually see. Citations are
//      the real URLs the provider returns, never domains the model recalls.
//   3. Mention, competitor mentions, "client site cited" and the evidence quote
//      are worked out in code from the answer text and citations
//      (_shared/measure.ts), so they are exact and repeatable.
//   4. Prominence, sentiment and accuracy still need judgement. For now the same
//      engine rates them in a separate call that only sees the finished answer;
//      an independent judge with a client fact sheet is the planned next step.
//
// The response keeps v1's result shape plus the full answer, per-sample detail
// and web-search status.
//
// Two ways in (the gateway requires a valid JWT for both):
//   - { job_id }: a queued measurement from geo_measure_jobs, sent by the
//     geo_dispatch_measure_jobs cron with the project's anon JWT. The job's
//     unguessable id is what authorises it, and only a job in status "sent" is
//     accepted. The function
//     loads the prompt, brand and competitors, measures, saves the
//     geo_responses row itself and marks the job done/skipped/failed.
//   - { engine, prompt, brand, ... }: a direct measurement for a signed-in user
//     (their access token is checked with Supabase Auth). Nothing is saved.
import { callModel, CORS, envKey, json, KEY_ENV, parseJson, providerFor } from "../_shared/providers.ts";
import type { ProviderId } from "../_shared/providers.ts";
import {
  citationDomains,
  citesSite,
  competitorsNamed,
  evidenceFor,
  mode,
  names,
  siteDomain,
} from "../_shared/measure.ts";
import type { Named } from "../_shared/measure.ts";

const PROMINENCE = ["Recommended", "Prominent", "Passing"];
const SENTIMENT = ["Positive", "Neutral", "Negative"];
const ACCURACY = ["Correct", "Minor error", "Major error"];

type Grade = { prominence: string; sentiment: string | null; accuracy: string | null };

type SampleRun = {
  answer: string;
  citations: string[];
  searched: boolean;
  search_error?: string;
  model: string;
  mentioned: boolean;
  competitors: string[];
  client_cited: boolean | null;
  prominence: string;
  sentiment: string | null;
  accuracy: string | null;
};

function gradePrompt(question: string, answer: string, brand: Named): string {
  const aka = (brand.aliases || []).filter(Boolean);
  return (
    "Below is a question a user asked an AI assistant, and the assistant's answer.\n\n" +
    "QUESTION:\n" + question + "\n\nANSWER:\n" + answer + "\n\n" +
    'Assess how the answer presents the brand "' + brand.name + '"' +
    (aka.length ? " (also written as: " + aka.join(", ") + ")" : "") +
    ". Return ONLY a JSON object with these keys:\n" +
    '- "prominence": "Recommended" if the answer recommends it or ranks it among ' +
    'its top picks; "Prominent" if it is discussed with some detail but not ' +
    'recommended; "Passing" if it is only named in passing.\n' +
    '- "sentiment": "Positive", "Neutral" or "Negative" — the tone towards the brand.\n' +
    '- "accuracy": "Correct", "Minor error" or "Major error" — whether what the ' +
    "answer states about the brand is factually right, to the best of your knowledge. " +
    'Use "Correct" when nothing stated about the brand is wrong.'
  );
}

function pick(value: unknown, allowed: string[]): string | null {
  const v = String(value ?? "").trim().toLowerCase();
  return allowed.find((a) => a.toLowerCase() === v) ?? null;
}

async function grade(
  provider: ProviderId,
  key: string,
  question: string,
  answer: string,
  brand: Named,
): Promise<Grade> {
  const out = await callModel(provider, key, gradePrompt(question, answer, brand), 1500);
  const g = out.error ? null : parseJson<Record<string, unknown>>(out.text);
  return {
    // A mentioned brand is at least "Passing" even when grading fails.
    prominence: pick(g?.prominence, PROMINENCE) ?? "Passing",
    sentiment: pick(g?.sentiment, SENTIMENT),
    accuracy: pick(g?.accuracy, ACCURACY),
  };
}

type MeasureInput = {
  engine: string;
  question: string;
  brand: Named;
  website?: string | null;
  competitors: Named[];
  samples: number;
};

type Outcome = {
  ok: boolean;
  error?: string;
  detail?: string;
  result?: Record<string, unknown> & { runs: SampleRun[] };
  [k: string]: unknown;
};

async function measure(input: MeasureInput): Promise<Outcome> {
  const { engine, question, brand, competitors } = input;
  const provider = providerFor(engine);
  if (!provider) return { ok: false, error: "unsupported", engine };

  const key = envKey(provider);
  if (!key) {
    return {
      ok: false,
      error: "no_key",
      engine,
      provider,
      detail: "Missing edge-function secret " + KEY_ENV[provider],
    };
  }
  if (!question || !brand.name) {
    return { ok: false, error: "prompt and brand required", engine };
  }
  const site = siteDomain(input.website);
  const samples = Math.max(1, Math.min(5, Number(input.samples) || 3));

  // Samples are independent, so they run side by side.
  const settled = await Promise.all(
    Array.from({ length: samples }, async (): Promise<SampleRun | string> => {
      const out = await callModel(provider, key, question, 4000, { webSearch: true });
      if (out.error) return out.error;
      if (!out.text.trim()) return out.model + " → empty answer";
      const mentioned = names(out.text, brand);
      const domains = citationDomains(out.citations);
      const g: Grade = mentioned
        ? await grade(provider, key, question, out.text, brand)
        : { prominence: "Absent", sentiment: null, accuracy: null };
      return {
        answer: out.text,
        citations: out.citations,
        searched: out.searched,
        search_error: out.searchError,
        model: out.model,
        mentioned,
        competitors: competitorsNamed(out.text, competitors),
        client_cited: out.searched && site ? citesSite(domains, site) : null,
        ...g,
      };
    }),
  );

  const runs = settled.filter((s): s is SampleRun => typeof s !== "string");
  const errors = settled.filter((s): s is string => typeof s === "string");
  if (!site) errors.push("No website set for this brand, so citation of its own site can't be checked");

  if (!runs.length) {
    return {
      ok: false,
      error: "call_failed",
      engine,
      provider,
      detail: errors[0] || "no usable response",
    };
  }

  const mentions: number[] = runs.map((r) => (r.mentioned ? 1 : 0));
  const mrate = mentions.reduce((a, b) => a + b, 0) / mentions.length;
  const mentionedRuns = runs.filter((r) => r.mentioned);

  const cited = mode(
    runs.map((r) => (r.client_cited == null ? null : r.client_cited ? "Yes" : "No")),
  ) || "n/a";

  const sources = citationDomains(runs.flatMap((r) => r.citations));
  const shown = mentionedRuns[0] || runs[0];

  const agreeMentions = mentions.every((v) => v === mentions[0]);
  const agreeProminence = runs.every((r) => r.prominence === runs[0].prominence);
  const confidence = agreeMentions && agreeProminence
    ? "High"
    : mrate <= 0.2 || mrate >= 0.8
    ? "Medium"
    : "Low";

  return {
    ok: true,
    engine,
    provider,
    model: shown.model,
    result: {
      method: "v2",
      model: shown.model,
      web_search: runs.every((r) => r.searched),
      answer: shown.answer,
      mentioned: mrate >= 0.5,
      mention_rate: Math.round(mrate * 100) / 100,
      prominence: mode(runs.map((r) => r.prominence)) || (mrate >= 0.5 ? "Passing" : "Absent"),
      sentiment: mode(mentionedRuns.map((r) => r.sentiment)),
      accuracy: mode(mentionedRuns.map((r) => r.accuracy)),
      cited,
      competitor_mentions: Math.round(
        runs.reduce((a, r) => a + r.competitors.length, 0) / runs.length,
      ),
      evidence: mentionedRuns.length ? evidenceFor(mentionedRuns[0].answer, brand) : "",
      cited_sources: sources.join(", "),
      samples: runs.length,
      confidence,
      runs,
    },
    warnings: errors.length ? errors.slice(0, 3) : undefined,
  };
}

// ---- Queued jobs -----------------------------------------------------------

const SB = Deno.env.get("SUPABASE_URL") || "";
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function rest(path: string, init: { method?: string; body?: unknown; prefer?: string } = {}) {
  return fetch(SB + "/rest/v1/" + path, {
    method: init.method || "GET",
    headers: {
      apikey: SR,
      authorization: "Bearer " + SR,
      "content-type": "application/json",
      ...(init.prefer ? { prefer: init.prefer } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function first<T>(path: string): Promise<T | null> {
  const r = await rest(path);
  if (!r.ok) return null;
  const rows = await r.json() as T[];
  return rows[0] ?? null;
}

type Job = {
  id: string;
  run_id: string;
  prompt_id: string;
  engine: string;
  samples: number;
  status: string;
  attempts: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Attempts per job before it is left as failed (the dispatcher counts sends). */
const MAX_ATTEMPTS = 2;

async function finish(job: Job, status: string, error: string | null) {
  await rest(`geo_measure_jobs?id=eq.${job.id}`, {
    method: "PATCH",
    body: { status, error, finished_at: status === "pending" ? null : new Date().toISOString() },
  });
}

async function runJob(jobId: string): Promise<Outcome> {
  if (!UUID.test(jobId)) return { ok: false, error: "bad job_id" };
  const job = await first<Job>(`geo_measure_jobs?id=eq.${jobId}&select=*`);
  if (!job || job.status !== "sent") return { ok: false, error: "job not found or not dispatched" };

  const [run, prompt] = await Promise.all([
    first<{ brand_id: string }>(`geo_runs?id=eq.${job.run_id}&select=brand_id`),
    first<{ text: string }>(`geo_prompts?id=eq.${job.prompt_id}&select=text`),
  ]);
  const brand = run
    ? await first<{ name: string; aliases: string[] | null; website: string | null }>(
      `geo_brands?id=eq.${run.brand_id}&select=name,aliases,website`,
    )
    : null;
  if (!prompt || !brand || !run) {
    await finish(job, "failed", "run, prompt or brand no longer exists");
    return { ok: false, error: "missing data" };
  }
  const compRes = await rest(`geo_competitors?brand_id=eq.${run.brand_id}&select=name,aliases`);
  const comps = compRes.ok ? await compRes.json() as Named[] : [];

  const out = await measure({
    engine: job.engine,
    question: prompt.text.trim(),
    brand: { name: brand.name.trim(), aliases: brand.aliases || [] },
    website: brand.website,
    competitors: comps.filter((c) => c.name?.trim()),
    samples: job.samples,
  });

  if (!out.ok || !out.result) {
    const why = [out.error, out.detail].filter(Boolean).join(" — ") || "measurement failed";
    // An engine without an API key is skipped, not failed: it isn't live.
    const status = out.error === "no_key"
      ? "skipped"
      : job.attempts < MAX_ATTEMPTS
      ? "pending"
      : "failed";
    await finish(job, status, why.slice(0, 500));
    return out;
  }

  const o = out.result;
  const row = {
    run_id: job.run_id,
    prompt_id: job.prompt_id,
    engine: job.engine,
    mentioned: !!o.mentioned,
    prominence: o.prominence || "Absent",
    sentiment: o.sentiment || null,
    accuracy: o.accuracy || null,
    cited: o.cited || "n/a",
    competitor_mentions: Number(o.competitor_mentions) || 0,
    evidence: o.evidence || null,
    cited_sources: o.cited_sources || null,
    samples: o.samples,
    mention_rate: o.mention_rate ?? null,
    confidence: o.confidence || null,
    answer: o.answer || null,
    method: "v2",
    model: o.model || null,
    web_search: o.web_search ?? null,
    raw: o.runs,
  };
  // One row per prompt × engine in a run: overwrite a capture-grid row if any.
  const existing = await first<{ id: string }>(
    `geo_responses?run_id=eq.${job.run_id}&prompt_id=eq.${job.prompt_id}` +
      `&engine=eq.${encodeURIComponent(job.engine)}&select=id`,
  );
  const saved = existing
    ? await rest(`geo_responses?id=eq.${existing.id}`, { method: "PATCH", body: row })
    : await rest("geo_responses", { method: "POST", body: row, prefer: "return=minimal" });
  if (!saved.ok) {
    await finish(job, "failed", ("save failed: " + (await saved.text())).slice(0, 500));
    return { ok: false, error: "save failed" };
  }
  await finish(job, "done", null);
  return out;
}

// ---- Entry point -----------------------------------------------------------

/** True when the request carries a signed-in user's access token. */
async function signedIn(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") || "";
  if (!/^bearer\s+\S+/i.test(auth)) return false;
  const apikey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const r = await fetch(SB + "/auth/v1/user", { headers: { apikey, authorization: auth } });
  await r.body?.cancel();
  return r.ok;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const body = await req.json().catch(() => ({})) as {
    job_id?: string;
    engine?: string;
    prompt?: string;
    brand?: string;
    brand_aliases?: string[] | null;
    website?: string | null;
    /** Competitor names. */
    competitors?: string[];
    /** Optional other names per competitor, keyed by competitor name. */
    competitor_aliases?: Record<string, string[] | null>;
    samples?: number;
  };

  if (body.job_id) return json(await runJob(String(body.job_id)));

  if (!(await signedIn(req))) return json({ ok: false, error: "sign-in required" }, 401);

  return json(
    await measure({
      engine: body.engine || "Claude",
      question: (body.prompt || "").trim(),
      brand: { name: (body.brand || "").trim(), aliases: body.brand_aliases || [] },
      website: body.website,
      competitors: (body.competitors || [])
        .map((n) => String(n || "").trim())
        .filter(Boolean)
        .map((name) => ({ name, aliases: body.competitor_aliases?.[name] || [] })),
      samples: Number(body.samples) || 3,
    }),
  );
});
