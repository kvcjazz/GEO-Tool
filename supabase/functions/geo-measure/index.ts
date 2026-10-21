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
// The response keeps v1's result shape (so the app and the batch can store it
// the same way) plus the full answer, per-sample detail and web-search status.
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


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const body = await req.json().catch(() => ({})) as {
    engine?: string;
    prompt?: string;
    brand?: string;
    brand_aliases?: string[] | null;
    website?: string | null;
    /** Competitor names — the same list geo-run (v1) takes. */
    competitors?: string[];
    /** Optional other names per competitor, keyed by competitor name. */
    competitor_aliases?: Record<string, string[] | null>;
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

  const question = (body.prompt || "").trim();
  const brand: Named = { name: (body.brand || "").trim(), aliases: body.brand_aliases || [] };
  if (!question || !brand.name) {
    return json({ ok: false, error: "prompt and brand required", engine });
  }
  const competitors: Named[] = (body.competitors || [])
    .map((n) => String(n || "").trim())
    .filter(Boolean)
    .map((name) => ({ name, aliases: body.competitor_aliases?.[name] || [] }));
  const site = siteDomain(body.website);
  const samples = Math.max(1, Math.min(5, Number(body.samples) || 3));

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
    return json({
      ok: false,
      error: "call_failed",
      engine,
      provider,
      detail: errors[0] || "no usable response",
    });
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

  return json({
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
  });
});
