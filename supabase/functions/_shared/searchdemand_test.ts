import { assertEquals } from "jsr:@std/assert@1";
import { cleanSearchDemand, matchSeed } from "./searchdemand.ts";

Deno.test("cleanSearchDemand normalises, de-duplicates and caps", () => {
  const t = cleanSearchDemand([
    { query: "  Best  PR Agency UK ", demand: 880, demand_kind: "volume", extra: "x" },
    { query: "best pr agency uk", demand: 10 },
    { query: "", demand: 5 },
    { query: "pr agency london", demand: "1200", demand_kind: "bogus" },
  ]);
  assertEquals(t.length, 2);
  assertEquals(t[0].query, "best pr agency uk");
  assertEquals(t[0].demand, 880);
  assertEquals(t[1].demand, 1200);
  assertEquals(t[1].demand_kind, null);
  assertEquals(cleanSearchDemand("nope"), []);
  assertEquals(cleanSearchDemand([{ query: "a" }, { query: "b" }], 1).length, 1);
});

Deno.test("matchSeed only accepts imported terms", () => {
  const t = cleanSearchDemand([{ query: "fintech pr agency", demand: 590, demand_kind: "volume" }]);
  assertEquals(matchSeed("Fintech PR  agency", t)?.demand, 590);
  assertEquals(matchSeed("“fintech pr agency”", t)?.query, "fintech pr agency");
  assertEquals(matchSeed("fintech pr agencies", t), null);
  assertEquals(matchSeed(null, t), null);
});
