// Shared multi-provider LLM client for the GEO edge functions.
//
// Why this file exists: response capture silently collapsed to Claude-only
// because (a) the other provider secrets went missing and (b) every provider
// call swallowed its error, so a dead model id or a missing key looked
// identical to "engine not live". Both failure modes are now visible, and the
// model ids are a fallback chain rather than a single hard-coded string that
// rots the next time a provider retires a model.
//
// Resolution order for the model of a provider:
//   1. the <PROVIDER>_MODEL edge-function secret, if set (no redeploy needed)
//   2. each id in MODEL_CHAIN, in order, skipping ids the provider rejects as
//      unknown/retired
// The winning id is cached for the life of the isolate so we probe once, not
// once per sample.
//
// Web search (measurement v2): callModel(..., { webSearch: true }) turns on
// each provider's own search tool so answers and citations reflect what a user
// of that engine actually sees. Perplexity always searches. If a provider
// rejects the search request, or a searched answer takes longer than
// SEARCH_TIMEOUT_MS, the call falls back to a plain answer and says so
// (`searched: false`, `searchError`) rather than failing silently.

export type ProviderId = "anthropic" | "openai" | "gemini" | "perplexity" | "xai";

export const PROVIDERS: ProviderId[] = [
  "anthropic",
  "openai",
  "gemini",
  "perplexity",
  "xai",
];

/** Edge-function secret holding each provider's API key. */
export const KEY_ENV: Record<ProviderId, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  xai: "XAI_API_KEY",
};

/** Optional secret that pins a model id, overriding MODEL_CHAIN. */
export const MODEL_ENV: Record<ProviderId, string> = {
  anthropic: "ANTHROPIC_MODEL",
  openai: "OPENAI_MODEL",
  gemini: "GEMINI_MODEL",
  perplexity: "PERPLEXITY_MODEL",
  xai: "XAI_MODEL",
};

/** Newest first. The first id the provider actually accepts is used. */
export const MODEL_CHAIN: Record<ProviderId, string[]> = {
  anthropic: ["claude-sonnet-5", "claude-sonnet-4-6", "claude-3-7-sonnet-latest"],
  openai: ["gpt-5.6", "gpt-5.4", "gpt-5.2", "gpt-4.1", "gpt-4o"],
  gemini: [
    "gemini-3.5-flash",
    "gemini-3-pro-preview",
    "gemini-3-flash-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
  ],
  perplexity: ["sonar-pro", "sonar"],
  xai: ["grok-4.6", "grok-4.5", "grok-4.3", "grok-4"],
};

/**
 * The engine names the UI shows, mapped to the provider that answers them.
 * Microsoft Copilot has no public API, so it is not measured (it used to be
 * the OpenAI model again, which double-counted ChatGPT).
 */
export const ENGINE_PROVIDER: Record<string, ProviderId> = {
  ChatGPT: "openai",
  "Google AI / Gemini": "gemini",
  Perplexity: "perplexity",
  Claude: "anthropic",
  Grok: "xai",
};

/** UI display order — matches ENGINES in src/lib/constants.ts. */
export const ENGINES: string[] = [
  "ChatGPT",
  "Google AI / Gemini",
  "Perplexity",
  "Claude",
  "Grok",
];

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "content-type": "application/json",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

export function envKey(provider: ProviderId): string {
  return Deno.env.get(KEY_ENV[provider]) || "";
}

/** Providers that currently have an API key configured. */
export function liveProviders(): Record<ProviderId, boolean> {
  const out = {} as Record<ProviderId, boolean>;
  for (const p of PROVIDERS) out[p] = !!envKey(p);
  return out;
}

/** Engine → live?, derived from which provider keys exist. */
export function liveEngineMap(): Record<string, boolean> {
  const live = liveProviders();
  const out: Record<string, boolean> = {};
  for (const engine of ENGINES) out[engine] = live[ENGINE_PROVIDER[engine]];
  return out;
}

/** Engine names that can actually be queried right now. */
export function liveEngines(): string[] {
  const map = liveEngineMap();
  return ENGINES.filter((e) => map[e]);
}

/** Tolerant engine-name → provider lookup for free-text callers. */
export function providerFor(engine: string): ProviderId | null {
  const exact = ENGINE_PROVIDER[engine];
  if (exact) return exact;
  const e = (engine || "").toLowerCase();
  if (e.includes("claude") || e.includes("anthropic")) return "anthropic";
  if (e.includes("perplex")) return "perplexity";
  if (e.includes("gemini") || e.includes("google")) return "gemini";
  if (e.includes("grok") || e.includes("xai")) return "xai";
  if (e.includes("chatgpt") || e.includes("gpt") || e.includes("openai")) {
    return "openai";
  }
  return null;
}

export type ModelResult = {
  text: string;
  citations: string[];
  model: string;
  /** Human-readable provider error, empty when the call succeeded. */
  error: string;
  /** True when the answer was produced with live web search available. */
  searched: boolean;
  /** Why a requested web search fell back to a plain answer, if it did. */
  searchError?: string;
};

export type CallOptions = {
  /** Answer with the provider's own web-search tool switched on. */
  webSearch?: boolean;
  /**
   * The buyer's country (ISO 3166-1 alpha-2, e.g. "GB"), passed to the search
   * as an approximate user location where the provider supports it (Claude,
   * OpenAI, Perplexity). Gemini and xAI have no such option and ignore it.
   */
  country?: string | null;
  /**
   * Who is spending: when given, every provider request this call makes
   * (each model id tried, each retry) is logged to geo_ai_usage.
   */
  usage?: UsageContext;
};

/** Labels a call in the AI spend log (geo_ai_usage). */
export type UsageContext = {
  /** Edge function name, e.g. "geo-measure". */
  fn: string;
  /** What the call is for, e.g. "answer", "grade", "entities". */
  purpose: string;
  /** The client the call is for, when there is one. */
  brandId?: string | null;
};

/** Tokens and searches one provider request used, as the provider reported them. */
export type Usage = {
  input: number;
  /** Output tokens including thinking/reasoning tokens (billed as output). */
  output: number;
  /** Web searches the provider billed for this request. */
  searches: number;
  /** Cost in USD when the provider reports it (Perplexity does). */
  costUsd?: number | null;
};

const ZERO: Usage = { input: 0, output: 0, searches: 0 };

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function addUsage(a: Usage, b: Usage): Usage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    searches: a.searches + b.searches,
    costUsd: a.costUsd != null || b.costUsd != null ? num(a.costUsd) + num(b.costUsd) : null,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Writes one row to geo_ai_usage. Best effort: logging must never fail or
 * noticeably slow the call it describes.
 */
async function logUsage(
  ctx: UsageContext | undefined,
  provider: ProviderId,
  model: string,
  u: Usage | undefined,
  ok: boolean,
  error: string,
): Promise<void> {
  if (!ctx) return;
  const url = Deno.env.get("SUPABASE_URL") || "";
  const sr = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !sr) return;
  const usage = u || ZERO;
  const row = {
    brand_id: ctx.brandId && UUID_RE.test(ctx.brandId) ? ctx.brandId : null,
    fn: ctx.fn.slice(0, 60),
    purpose: ctx.purpose.slice(0, 60),
    provider,
    model: model.slice(0, 120),
    ok,
    input_tokens: Math.round(usage.input),
    output_tokens: Math.round(usage.output),
    searches: Math.round(usage.searches),
    reported_cost_usd: usage.costUsd ?? null,
    error: ok ? null : (error || "").slice(0, 300),
  };
  try {
    const r = await fetch(url + "/rest/v1/geo_ai_usage", {
      method: "POST",
      headers: {
        apikey: sr,
        authorization: "Bearer " + sr,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(4000),
    });
    await r.body?.cancel();
  } catch {
    /* spend logging is best effort */
  }
}

/** A valid upper-case ISO 3166-1 alpha-2 code, or null. */
export function countryCode(c: unknown): string | null {
  const v = String(c ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

type Attempt = {
  ok: boolean;
  status: number;
  text: string;
  citations: string[];
  message: string;
  /** What the request used, when the provider said (also on some failures). */
  usage?: Usage;
};

const resolvedModel = new Map<ProviderId, string>();

function candidates(provider: ProviderId): string[] {
  const pinned = Deno.env.get(MODEL_ENV[provider]);
  if (pinned) return [pinned];
  const cached = resolvedModel.get(provider);
  const chain = MODEL_CHAIN[provider];
  if (cached) return [cached, ...chain.filter((m) => m !== cached)];
  return chain;
}

/**
 * True when the provider is telling us this model id is unusable (retired,
 * renamed, not entitled) rather than that the request itself was bad. Only
 * these are worth retrying with the next id in the chain.
 */
function isModelUnavailable(status: number, message: string): boolean {
  const m = (message || "").toLowerCase();
  if (
    /model/.test(m) &&
    /(not found|does not exist|doesn't exist|unknown|unsupported|invalid|decommission|deprecat|no longer|retired|not available|no access)/
      .test(m)
  ) {
    return true;
  }
  // Gemini answers an unknown model with a bare 404 on the model path.
  return status === 404;
}

/**
 * An account-level billing/quota block. Providers return this as 429, the same
 * status as genuine rate limiting, but no amount of waiting or trying a
 * different model fixes it — so it must fail fast rather than walk the whole
 * model chain twice over.
 */
function isBillingBlock(message: string): boolean {
  return /(insufficient_quota|exceeded your current quota|quota|billing|payment required|credit balance|no credits|usage limits?)/i
    .test(message || "");
}

/** Plain-English fix for an account-level block, by kind. */
function billingAdvice(provider: ProviderId, message: string): string {
  if (/usage limits?/i.test(message)) {
    return `the ${provider} account has reached the monthly spend limit set on it — ` +
      `raise the limit in that provider's console (Anthropic: Settings → Limits)`;
  }
  return `${KEY_ENV[provider]} is valid but the ${provider} account has no credit/quota — ` +
    `add billing with that provider`;
}

function errText(status: number, payload: unknown): string {
  const p = payload as
    | { error?: { message?: string } | string; message?: string }
    | undefined;
  let msg = "";
  if (p && typeof p.error === "object" && p.error) msg = p.error.message || "";
  else if (p && typeof p.error === "string") msg = p.error;
  if (!msg && p && typeof p.message === "string") msg = p.message;
  if (!msg) msg = typeof payload === "string" ? payload : JSON.stringify(payload ?? "");
  return `HTTP ${status}: ${String(msg).slice(0, 300)}`;
}

async function readJson(r: Response): Promise<unknown> {
  const raw = await r.text();
  try {
    return JSON.parse(raw);
  } catch {
    return raw.slice(0, 300);
  }
}

/**
 * A searched answer can take minutes when the model keeps searching. Past this,
 * the call is abandoned for a plain answer so one slow sample can't push the
 * whole measurement past the edge-function time limit.
 */
const SEARCH_TIMEOUT_MS = 90_000;
/** Status used for an abandoned (timed-out) search call; not retried. */
const TIMED_OUT = 408;

/**
 * Current Claude models think before answering by default, and thinking counts
 * against max_tokens. A small cap (the old 800–1500) could be spent entirely on
 * thinking, leaving an empty reply. Claude calls get at least this much room;
 * only tokens actually generated are billed.
 */
const ANTHROPIC_MIN_TOKENS = 16000;

/** A Claude reply with no text: say why instead of passing on an empty answer. */
function emptyClaude(stopReason: string | undefined): Attempt {
  return fail(
    422,
    stopReason === "max_tokens"
      ? "the reply was cut off before any text (token limit reached while thinking)"
      : stopReason === "refusal"
      ? "the model declined to answer"
      : `empty reply (stop_reason: ${stopReason || "unknown"})`,
  );
}

const fail = (status: number, message: string): Attempt => ({
  ok: false,
  status,
  text: "",
  citations: [],
  message,
});

/** Anthropic Messages `usage` → Usage (cache tokens count as input). */
function anthropicUsage(u: unknown): Usage {
  const x = (u || {}) as {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    server_tool_use?: { web_search_requests?: number };
  };
  return {
    input: num(x.input_tokens) + num(x.cache_creation_input_tokens) + num(x.cache_read_input_tokens),
    output: num(x.output_tokens),
    searches: num(x.server_tool_use?.web_search_requests),
  };
}

type AnthropicBlock = {
  type?: string;
  text?: string;
  citations?: { url?: string }[];
  content?: { type?: string; url?: string }[] | { error_code?: string };
};

/**
 * Claude with its server-side web search tool. This uses the basic tool, capped
 * at 3 searches: the dynamic-filtering version runs code over the results and
 * was too slow here (answers past 150 s). A long search turn can stop with
 * `pause_turn`, which is resumed by sending the partial assistant turn back.
 */
async function anthropicSearch(
  key: string,
  prompt: string,
  model: string,
  maxTokens: number,
  country: string | null,
): Promise<Attempt> {
  const tool = {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 3,
    ...(country ? { user_location: { type: "approximate", country } } : {}),
  };
  const messages: { role: string; content: unknown }[] = [
    { role: "user", content: prompt },
  ];
  const blocks: AnthropicBlock[] = [];
  let lastStop: string | undefined;
  // Every turn is billed, so usage is summed across pause_turn resumptions.
  let usage: Usage = ZERO;
  for (let turn = 0; turn < 3; turn++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.max(maxTokens, ANTHROPIC_MIN_TOKENS),
        messages,
        tools: [tool],
      }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    const j = (await readJson(r)) as {
      content?: AnthropicBlock[];
      stop_reason?: string;
      usage?: unknown;
    };
    if (!r.ok) return { ...fail(r.status, errText(r.status, j)), usage };
    usage = addUsage(usage, anthropicUsage(j.usage));
    blocks.push(...(j.content || []));
    lastStop = j.stop_reason;
    if (j.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: j.content || [] });
  }
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("");
  if (!text.trim()) return { ...emptyClaude(lastStop), usage };
  // Only the sources Claude cites in its answer — not every page it read.
  const citations = blocks
    .flatMap((b) => (b.type === "text" ? (b.citations || []).map((c) => c.url || "") : []))
    .filter(Boolean);
  return { ok: true, status: 200, text, citations, message: "", usage };
}

/**
 * OpenAI and xAI with the Responses API web_search tool. URLs come from the
 * `url_citation` annotations on the answer text (xAI also returns a top-level
 * `citations` list).
 */
async function responsesSearch(
  url: string,
  key: string,
  prompt: string,
  model: string,
  country: string | null = null,
): Promise<Attempt> {
  const tool = {
    type: "web_search",
    ...(country ? { user_location: { type: "approximate", country } } : {}),
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({ model, input: prompt, tools: [tool] }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  const j = (await readJson(r)) as {
    output?: {
      type?: string;
      content?: {
        type?: string;
        text?: string;
        annotations?: { type?: string; url?: string }[];
      }[];
    }[];
    citations?: (string | { url?: string })[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  if (!r.ok) return fail(r.status, errText(r.status, j));
  // Each web_search_call output item is one billed search.
  const usage: Usage = {
    input: num(j.usage?.input_tokens),
    output: num(j.usage?.output_tokens),
    searches: (j.output || []).filter((o) => o.type === "web_search_call").length,
  };
  const parts = (j.output || [])
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content || [])
    .filter((c) => c.type === "output_text");
  const text = parts.map((c) => c.text || "").join("");
  const citations = [
    ...parts.flatMap((c) =>
      (c.annotations || [])
        .filter((a) => a.type === "url_citation")
        .map((a) => a.url || "")
    ),
    ...(j.citations || []).map((c) => (typeof c === "string" ? c : c.url || "")),
  ].filter(Boolean);
  return { ok: true, status: r.status, text, citations, message: "", usage };
}

/**
 * Gemini grounding chunks point at a vertexaisearch redirect, with the real
 * site in `title`. Keep real URLs as-is; turn redirects into the site domain.
 */
function geminiSource(web: { uri?: string; title?: string }): string {
  const uri = web.uri || "";
  if (uri && !uri.includes("vertexaisearch.cloud.google.com")) return uri;
  const t = (web.title || "").trim().toLowerCase();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(t) ? "https://" + t : "";
}

async function attempt(
  provider: ProviderId,
  key: string,
  prompt: string,
  model: string,
  maxTokens: number,
  webSearch: boolean,
  country: string | null,
): Promise<Attempt> {
  if (provider === "anthropic") {
    if (webSearch) return anthropicSearch(key, prompt, model, maxTokens, country);
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.max(maxTokens, ANTHROPIC_MIN_TOKENS),
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const j = (await readJson(r)) as {
      content?: { type?: string; text?: string }[];
      stop_reason?: string;
      usage?: unknown;
    };
    if (!r.ok) return fail(r.status, errText(r.status, j));
    const usage = anthropicUsage(j.usage);
    const text = (j.content || [])
      .filter((c) => !c.type || c.type === "text")
      .map((c) => c.text || "")
      .join("");
    if (!text.trim()) return { ...emptyClaude(j.stop_reason), usage };
    return { ok: true, status: r.status, text, citations: [], message: "", usage };
  }

  if (webSearch && provider === "openai") {
    return responsesSearch("https://api.openai.com/v1/responses", key, prompt, model, country);
  }
  if (webSearch && provider === "xai") {
    return responsesSearch("https://api.x.ai/v1/responses", key, prompt, model);
  }

  if (provider === "openai" || provider === "xai" || provider === "perplexity") {
    // All three speak the OpenAI chat-completions shape.
    const url = provider === "xai"
      ? "https://api.x.ai/v1/chat/completions"
      : provider === "perplexity"
      ? "https://api.perplexity.ai/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
    const r = await fetch(url, {
      method: "POST",
      headers: {
        authorization: "Bearer " + key,
        "content-type": "application/json",
      },
      // No max_tokens: newer OpenAI/xAI models reject it in favour of
      // max_completion_tokens, and the default cap is ample here.
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        ...(provider === "perplexity" && country
          ? { web_search_options: { user_location: { country } } }
          : {}),
      }),
    });
    const j = (await readJson(r)) as {
      choices?: { message?: { content?: string } }[];
      citations?: string[];
      search_results?: { url?: string }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        num_search_queries?: number;
        cost?: { total_cost?: number };
      };
    };
    if (!r.ok) return fail(r.status, errText(r.status, j));
    const usage: Usage = {
      input: num(j.usage?.prompt_tokens),
      output: num(j.usage?.completion_tokens),
      // Perplexity searches (and charges a request fee) on every call.
      searches: provider === "perplexity" ? num(j.usage?.num_search_queries) || 1 : 0,
      costUsd: typeof j.usage?.cost?.total_cost === "number" ? j.usage.cost.total_cost : null,
    };
    const text = j.choices?.[0]?.message?.content || "";
    // Perplexity returns real sources; newer responses use search_results.
    const citations = [
      ...(j.citations || []),
      ...(j.search_results || []).map((s) => s.url || ""),
    ].filter(Boolean);
    return { ok: true, status: r.status, text, citations, message: "", usage };
  }

  // Gemini
  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) +
      ":generateContent",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        ...(webSearch ? { tools: [{ google_search: {} }] } : {}),
      }),
      ...(webSearch ? { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) } : {}),
    },
  );
  const j = (await readJson(r)) as {
    candidates?: {
      content?: { parts?: { text?: string; thought?: boolean }[] };
      groundingMetadata?: {
        groundingChunks?: { web?: { uri?: string; title?: string } }[];
        webSearchQueries?: string[];
      };
    }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
      toolUsePromptTokenCount?: number;
    };
  };
  if (!r.ok) return fail(r.status, errText(r.status, j));
  const um = j.usageMetadata;
  const usage: Usage = {
    input: num(um?.promptTokenCount) + num(um?.toolUsePromptTokenCount),
    // Thinking tokens are billed as output.
    output: num(um?.candidatesTokenCount) + num(um?.thoughtsTokenCount),
    searches: (j.candidates?.[0]?.groundingMetadata?.webSearchQueries || []).length,
  };
  // Thinking models interleave reasoning parts — those must not reach the
  // JSON parser or it locks onto braces inside the reasoning.
  const text = (j.candidates?.[0]?.content?.parts || [])
    .filter((p) => !p.thought)
    .map((p) => p.text || "")
    .join(" ");
  const citations = (j.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
    .map((c) => geminiSource(c.web || {}))
    .filter(Boolean);
  return { ok: true, status: r.status, text, citations, message: "", usage };
}

/**
 * Query a provider, walking MODEL_CHAIN past any retired model ids and
 * retrying once on a transient (429/5xx) failure. Never throws — a failed
 * call comes back with `error` populated so callers can report it.
 */
export async function callModel(
  provider: ProviderId,
  key: string,
  prompt: string,
  maxTokens = 900,
  opts: CallOptions = {},
): Promise<ModelResult> {
  // Perplexity searches on every call; the others only when asked.
  const webSearch = !!opts.webSearch && provider !== "perplexity";
  const searched = webSearch || provider === "perplexity";
  // Location only matters when the answer is searched.
  const country = searched ? countryCode(opts.country) : null;
  let lastError = "";
  let lastModel = "";
  for (const model of candidates(provider)) {
    lastModel = model;
    for (let tries = 0; tries < 2; tries++) {
      let a: Attempt;
      try {
        a = await attempt(provider, key, prompt, model, maxTokens, webSearch, country);
      } catch (e) {
        const timedOut = e instanceof DOMException && e.name === "TimeoutError";
        a = timedOut
          ? fail(TIMED_OUT, `timed out after ${SEARCH_TIMEOUT_MS / 1000}s`)
          : fail(0, String(e));
      }
      // Every request is logged, failed ones too: a timed-out search may still
      // have been billed, and spend-limit failures show up in the spend panel.
      await logUsage(opts.usage, provider, model, a.usage, a.ok, a.message);
      if (a.ok) {
        resolvedModel.set(provider, model);
        return { text: a.text, citations: a.citations, model, error: "", searched };
      }
      lastError = `${model} → ${a.message}`;
      if (isBillingBlock(a.message)) {
        // The key authenticates but the account has no credit. Say so plainly:
        // the fix is on the provider's billing page, not in this code.
        return {
          text: "",
          citations: [],
          model,
          searched,
          error: `${billingAdvice(provider, a.message)}. (${a.message})`,
        };
      }
      if (isModelUnavailable(a.status, a.message)) break; // next model id
      const transient = a.status === 429 || a.status >= 500 || a.status === 0;
      if (!transient) {
        // A provider that rejects the location (e.g. an unsupported country)
        // is asked again without it, rather than losing the search.
        if (country) {
          const retry = await callModel(provider, key, prompt, maxTokens, { ...opts, country: null });
          return { ...retry, searchError: retry.searchError || "location ignored: " + lastError };
        }
        // Auth or bad request: another model id will not help. A rejected
        // search request still gets a plain answer, flagged as unsearched.
        if (webSearch) return searchFallback(provider, key, prompt, maxTokens, lastError, opts.usage);
        return { text: "", citations: [], model, error: lastError, searched };
      }
      if (tries === 0) await new Promise((res) => setTimeout(res, 1200));
    }
  }
  if (webSearch) return searchFallback(provider, key, prompt, maxTokens, lastError, opts.usage);
  return {
    text: "",
    citations: [],
    model: lastModel,
    searched,
    error: lastError || "no model available",
  };
}

async function searchFallback(
  provider: ProviderId,
  key: string,
  prompt: string,
  maxTokens: number,
  searchError: string,
  usage?: UsageContext,
): Promise<ModelResult> {
  const plain = await callModel(provider, key, prompt, maxTokens, { usage });
  return { ...plain, searched: false, searchError: searchError || "search unavailable" };
}

/**
 * Providers used for analysis (suggestions, Radar, titles, source types,
 * listening questions), in order of preference. Measurement never uses this:
 * each engine must be asked through its own provider.
 */
export const ANALYST_ORDER: ProviderId[] = ["anthropic", "openai", "gemini"];

/**
 * Runs an analysis prompt on the first provider in ANALYST_ORDER that has a
 * key and answers, so one account being out of credit or over its spend limit
 * doesn't stop the tool. `fellBackFrom` lists the providers that failed first.
 */
export async function callAnalyst(
  prompt: string,
  maxTokens = 4000,
  usage?: UsageContext,
): Promise<ModelResult & { provider?: ProviderId; fellBackFrom?: string }> {
  const errors: string[] = [];
  for (const provider of ANALYST_ORDER) {
    const key = envKey(provider);
    if (!key) continue;
    const out = await callModel(provider, key, prompt, maxTokens, { usage });
    if (!out.error && out.text.trim()) {
      return { ...out, provider, fellBackFrom: errors.length ? errors.join(" | ") : undefined };
    }
    errors.push(`${provider}: ${out.error || "empty reply"}`);
  }
  return {
    text: "",
    citations: [],
    model: "",
    searched: false,
    error: errors.length ? errors.join(" | ") : "No AI provider key is set in the edge-function secrets",
  };
}

/** Pull the first JSON object out of a model reply, tolerating code fences. */
export function parseJson<T = Record<string, unknown>>(text: string): T | null {
  if (!text) return null;
  const t = text.replace(/```json/gi, "").replace(/```/g, "");
  const i = t.indexOf("{");
  const k = t.lastIndexOf("}");
  if (i < 0 || k < 0 || k < i) return null;
  try {
    return JSON.parse(t.slice(i, k + 1)) as T;
  } catch {
    return null;
  }
}

/** Pull the first JSON array of strings out of a model reply. */
export function parseStringArray(text: string): string[] | null {
  if (!text) return null;
  const t = text.replace(/```json/gi, "").replace(/```/g, "");
  const i = t.indexOf("[");
  const k = t.lastIndexOf("]");
  if (i < 0 || k < 0 || k < i) return null;
  try {
    const a = JSON.parse(t.slice(i, k + 1));
    return Array.isArray(a)
      ? a.filter((x) => typeof x === "string" && x.length > 4)
      : null;
  } catch {
    return null;
  }
}

export function domainOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}
