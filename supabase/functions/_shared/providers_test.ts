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
