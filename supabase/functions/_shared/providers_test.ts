// Run with: deno test --allow-env _shared/
import { assert, assertEquals } from "jsr:@std/assert@1";
import { callModel } from "./providers.ts";

Deno.test("Claude reply cut off while thinking is an error, not an empty answer", async () => {
  const real = globalThis.fetch;
  const sent: number[] = [];
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)).max_tokens);
    return Promise.resolve(
      new Response(
        JSON.stringify({ content: [{ type: "thinking", thinking: "" }], stop_reason: "max_tokens" }),
        { status: 200 },
      ),
    );
  }) as typeof fetch;
  try {
    const out = await callModel("anthropic", "test-key", "hello", 1500);
    assertEquals(out.text, "");
    assert(out.error.includes("cut off"), out.error);
    // Small caps are raised so thinking can't use up the whole budget.
    assert(sent.every((n) => n >= 16000), String(sent));
  } finally {
    globalThis.fetch = real;
  }
});

// ---- Spend logging (geo_ai_usage) ------------------------------------------

type Logged = Record<string, unknown>;

/** Replies with `reply` to the provider and records rows posted to geo_ai_usage. */
function withProvider(reply: unknown, status = 200): { restore: () => void; logged: Logged[] } {
  const real = globalThis.fetch;
  const logged: Logged[] = [];
  Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role");
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    if (String(url).endsWith("/rest/v1/geo_ai_usage")) {
      logged.push(JSON.parse(String(init?.body)));
      return Promise.resolve(new Response(null, { status: 201 }));
    }
    return Promise.resolve(new Response(JSON.stringify(reply), { status }));
  }) as typeof fetch;
  return {
    restore: () => {
      globalThis.fetch = real;
      Deno.env.delete("SUPABASE_URL");
      Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    },
    logged,
  };
}

const BRAND = "0b5d1c1e-0000-4000-8000-000000000001";
const ctx = { fn: "geo-measure", purpose: "answer", brandId: BRAND };

Deno.test("Claude search: tokens incl. cache and billed searches are logged", async () => {
  const m = withProvider({
    content: [{ type: "text", text: "Acme is good." }],
    stop_reason: "end_turn",
    usage: {
      input_tokens: 100,
      cache_read_input_tokens: 20,
      output_tokens: 300,
      server_tool_use: { web_search_requests: 2 },
    },
  });
  try {
    const out = await callModel("anthropic", "k", "q", 4000, { webSearch: true, usage: ctx });
    assertEquals(out.error, "");
    assertEquals(m.logged.length, 1);
    const row = m.logged[0];
    assertEquals([row.input_tokens, row.output_tokens, row.searches], [120, 300, 2]);
    assertEquals([row.fn, row.purpose, row.provider, row.brand_id, row.ok], ["geo-measure", "answer", "anthropic", BRAND, true]);
  } finally {
    m.restore();
  }
});

Deno.test("OpenAI search: each web_search_call is one search", async () => {
  const m = withProvider({
    output: [
      { type: "web_search_call" },
      { type: "web_search_call" },
      { type: "message", content: [{ type: "output_text", text: "hi", annotations: [] }] },
    ],
    usage: { input_tokens: 50, output_tokens: 70 },
  });
  try {
    await callModel("openai", "k", "q", 4000, { webSearch: true, usage: ctx });
    assertEquals([m.logged[0].input_tokens, m.logged[0].output_tokens, m.logged[0].searches], [50, 70, 2]);
  } finally {
    m.restore();
  }
});

Deno.test("Perplexity: one search per call and its reported cost", async () => {
  const m = withProvider({
    choices: [{ message: { content: "hi" } }],
    usage: { prompt_tokens: 9, completion_tokens: 11, cost: { total_cost: 0.0062 } },
  });
  try {
    await callModel("perplexity", "k", "q", 1500, { usage: { ...ctx, purpose: "grade" } });
    const row = m.logged[0];
    assertEquals([row.searches, row.reported_cost_usd, row.purpose], [1, 0.0062, "grade"]);
  } finally {
    m.restore();
  }
});

Deno.test("Gemini: thinking tokens count as output", async () => {
  const m = withProvider({
    candidates: [{ content: { parts: [{ text: "hi" }] }, groundingMetadata: { webSearchQueries: ["a"] } }],
    usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 40, thoughtsTokenCount: 25 },
  });
  try {
    await callModel("gemini", "k", "q", 1500, { webSearch: true, usage: ctx });
    assertEquals([m.logged[0].input_tokens, m.logged[0].output_tokens, m.logged[0].searches], [30, 65, 1]);
  } finally {
    m.restore();
  }
});

Deno.test("a spend-limit failure is logged as failed, and nothing is logged without a label", async () => {
  const m = withProvider({ error: { message: "You have reached your specified API usage limits." } }, 400);
  try {
    const out = await callModel("anthropic", "k", "q", 1500, { usage: ctx });
    assert(out.error.includes("spend limit"), out.error);
    assertEquals(m.logged.length, 1);
    assertEquals(m.logged[0].ok, false);
    await callModel("anthropic", "k", "q", 1500);
    assertEquals(m.logged.length, 1);
  } finally {
    m.restore();
  }
});
