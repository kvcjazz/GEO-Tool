// Run with: deno test --allow-env _shared/
import { assertEquals } from "jsr:@std/assert@1";
import { gradeAll, gradePrompt } from "./grade.ts";

function mockFetch(reply: string): { restore: () => void; calls: string[] } {
  const real = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push(String(url));
    if (String(url).includes("/rest/v1/")) return Promise.resolve(new Response(null, { status: 201 }));
    void init;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: reply }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { status: 200 },
      ),
    );
  }) as typeof fetch;
  return { restore: () => (globalThis.fetch = real), calls };
}

const brand = { name: "Acme", aliases: [] };
const usage = { fn: "geo-measure", purpose: "grade" };

Deno.test("three mentioned samples are graded in one call, in order", async () => {
  const m = mockFetch(
    JSON.stringify({
      answers: [
        { answer: 2, prominence: "Passing", sentiment: "Negative", accuracy: "Minor error" },
        { answer: 1, prominence: "Recommended", sentiment: "Positive", accuracy: "Correct" },
        { answer: 3, prominence: "Prominent", sentiment: "Neutral", accuracy: "Correct" },
      ],
    }),
  );
  try {
    const g = await gradeAll("anthropic", "k", "Best widget firms?", ["a", "b", "c"], brand, "", usage);
    assertEquals(m.calls.filter((u) => u.includes("anthropic.com")).length, 1);
    assertEquals(g.map((x) => x.prominence), ["Recommended", "Passing", "Prominent"]);
    assertEquals(g[1].sentiment, "Negative");
  } finally {
    m.restore();
  }
});

Deno.test("one sample answered as a bare object still parses", async () => {
  const m = mockFetch('{"prominence":"Prominent","sentiment":"Positive","accuracy":"Correct"}');
  try {
    const g = await gradeAll("anthropic", "k", "q", ["only"], brand, "", usage);
    assertEquals(g, [{ prominence: "Prominent", sentiment: "Positive", accuracy: "Correct", accuracy_note: undefined }]);
  } finally {
    m.restore();
  }
});

Deno.test("an unreadable reply leaves a mentioned brand at Passing", async () => {
  const m = mockFetch("sorry, no JSON here");
  try {
    const g = await gradeAll("anthropic", "k", "q", ["a", "b"], brand, "", usage);
    assertEquals(g.map((x) => x.prominence), ["Passing", "Passing"]);
    assertEquals(g[0].sentiment, null);
  } finally {
    m.restore();
  }
});

Deno.test("no mentioned samples means no grading call", async () => {
  const m = mockFetch("{}");
  try {
    assertEquals(await gradeAll("anthropic", "k", "q", [], brand, "", usage), []);
    assertEquals(m.calls.length, 0);
  } finally {
    m.restore();
  }
});

Deno.test("prompt numbers every answer and asks for each on its own", () => {
  const p = gradePrompt("q", ["first", "second"], brand, "Founded 2001");
  assertEquals(p.includes("ANSWER 1:\nfirst") && p.includes("ANSWER 2:\nsecond"), true);
  assertEquals(p.includes("EACH answer, on its own"), true);
  assertEquals(p.includes("accuracy_note"), true);
});
