// Run with: deno test --allow-env _shared/
import { assertEquals } from "jsr:@std/assert@1";
import { extractEntities } from "./entities.ts";

Deno.test("extractEntities: order kept, client found in code, branded flag", async () => {
  Deno.env.set("ANTHROPIC_API_KEY", "test");
  const real = globalThis.fetch;
  const reply = {
    answers: [
      { id: "a#0", brands: [{ name: "Lemonade", recommended: true }, { name: "State Farm", recommended: false }] },
      // The model left Hippo out of this one although the answer names it.
      { id: "a#1", brands: [{ name: "Allstate", recommended: true }] },
    ],
  };
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(reply) }], stop_reason: "end_turn" })),
    )) as typeof fetch;
  try {
    const { out } = await extractEntities({ name: "Hippo", aliases: [], sector: "Home insurance" }, [
      {
        id: "a",
        question: "best home insurance for first-time buyers in Texas",
        answers: ["Lemonade is great. State Farm too.", "Allstate is solid; Hippo is also worth a look."],
      },
    ]);
    const e = out.get("a")!;
    assertEquals(e.branded, false);
    assertEquals(e.samples[0].map((x) => x.name), ["Lemonade", "State Farm"]);
    assertEquals(e.samples[1].map((x) => [x.name, x.client]), [["Allstate", false], ["Hippo", true]]);
  } finally {
    globalThis.fetch = real;
    Deno.env.delete("ANTHROPIC_API_KEY");
  }
});
