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

/** The engine names the UI shows, mapped to the provider that answers them. */
export const ENGINE_PROVIDER: Record<string, ProviderId> = {
  ChatGPT: "openai",
  "Google AI / Gemini": "gemini",
  Perplexity: "perplexity",
  Copilot: "openai",
  Claude: "anthropic",
  Grok: "xai",
};

/** UI display order — matches ENGINES in src/lib/constants.ts. */
export const ENGINES: string[] = [
  "ChatGPT",
  "Google AI / Gemini",
  "Perplexity",
  "Copilot",
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
  if (e.includes("copilot")) return "openai";
  return null;
}

export type ModelResult = {
  text: string;
  citations: string[];
  model: string;
  /** Human-readable provider error, empty when the call succeeded. */
  error: string;
};

type Attempt = {
  ok: boolean;
  status: number;
  text: string;
  citations: string[];
  message: string;
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
  return /(insufficient_quota|exceeded your current quota|quota|billing|payment required|credit balance|no credits)/i
    .test(message || "");
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

async function attempt(
  provider: ProviderId,
  key: string,
  prompt: string,
  model: string,
  maxTokens: number,
): Promise<Attempt> {
  const fail = (status: number, message: string): Attempt => ({
    ok: false,
    status,
    text: "",
    citations: [],
    message,
  });

  if (provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const j = (await readJson(r)) as {
      content?: { type?: string; text?: string }[];
    };
    if (!r.ok) return fail(r.status, errText(r.status, j));
    const text = (j.content || [])
      .filter((c) => !c.type || c.type === "text")
      .map((c) => c.text || "")
      .join("");
    return { ok: true, status: r.status, text, citations: [], message: "" };
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
      }),
    });
    const j = (await readJson(r)) as {
      choices?: { message?: { content?: string } }[];
      citations?: string[];
      search_results?: { url?: string }[];
    };
    if (!r.ok) return fail(r.status, errText(r.status, j));
    const text = j.choices?.[0]?.message?.content || "";
    // Perplexity returns real sources; newer responses use search_results.
    const citations = [
      ...(j.citations || []),
      ...(j.search_results || []).map((s) => s.url || ""),
    ].filter(Boolean);
    return { ok: true, status: r.status, text, citations, message: "" };
  }

  // Gemini
  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) +
      ":generateContent",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );
  const j = (await readJson(r)) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  if (!r.ok) return fail(r.status, errText(r.status, j));
  // Thinking models interleave reasoning parts — those must not reach the
  // JSON parser or it locks onto braces inside the reasoning.
  const text = (j.candidates?.[0]?.content?.parts || [])
    .filter((p) => !p.thought)
    .map((p) => p.text || "")
    .join(" ");
  return { ok: true, status: r.status, text, citations: [], message: "" };
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
): Promise<ModelResult> {
  let lastError = "";
  let lastModel = "";
  for (const model of candidates(provider)) {
    lastModel = model;
    for (let tries = 0; tries < 2; tries++) {
      let a: Attempt;
      try {
        a = await attempt(provider, key, prompt, model, maxTokens);
      } catch (e) {
        a = { ok: false, status: 0, text: "", citations: [], message: String(e) };
      }
      if (a.ok) {
        resolvedModel.set(provider, model);
        return { text: a.text, citations: a.citations, model, error: "" };
      }
      lastError = `${model} → ${a.message}`;
      if (isBillingBlock(a.message)) {
        // The key authenticates but the account has no credit. Say so plainly:
        // the fix is on the provider's billing page, not in this code.
        return {
          text: "",
          citations: [],
          model,
          error: `${KEY_ENV[provider]} is valid but the ${provider} account has no ` +
            `credit/quota — add billing with that provider. (${a.message})`,
        };
      }
      if (isModelUnavailable(a.status, a.message)) break; // next model id
      const transient = a.status === 429 || a.status >= 500 || a.status === 0;
      if (!transient) {
        // Auth or bad request: another model id will not help.
        return { text: "", citations: [], model, error: lastError };
      }
      if (tries === 0) await new Promise((res) => setTimeout(res, 1200));
    }
  }
  return {
    text: "",
    citations: [],
    model: lastModel,
    error: lastError || "no model available",
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
