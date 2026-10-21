import { assertEquals } from "jsr:@std/assert@1";
import {
  citationDomains,
  citesSite,
  competitorsNamed,
  evidenceFor,
  names,
  siteDomain,
} from "./measure.ts";

Deno.test("names: whole words, any case, aliases", () => {
  const acme = { name: "Acme Corp", aliases: ["Acme"] };
  assertEquals(names("I'd try ACME-corp first.", acme), true);
  assertEquals(names("Acme's pricing is fair.", acme), true);
  assertEquals(names("Acmeology is unrelated.", acme), false);
  assertEquals(names("Dropbox and Box.com", { name: "Box" }), true);
  assertEquals(names("Dropbox is popular", { name: "Box" }), false);
  assertEquals(names("Try Monzo (UK)", { name: "Monzo" }), true);
  assertEquals(names("anything", { name: "  " }), false);
});

Deno.test("names: regex characters in names are literal", () => {
  assertEquals(names("We use C++ daily", { name: "C++" }), true);
  assertEquals(names("Ask Yahoo! today", { name: "Yahoo!" }), true);
  assertEquals(names("Ask Yahoo today", { name: "Yahoo!" }), false);
});

Deno.test("competitorsNamed returns primary names", () => {
  const comps = [{ name: "Wise", aliases: ["TransferWise"] }, { name: "Revolut" }];
  assertEquals(competitorsNamed("TransferWise beats most banks.", comps), ["Wise"]);
  assertEquals(competitorsNamed("Neither is mentioned.", comps), []);
});

Deno.test("site domain and citations", () => {
  assertEquals(siteDomain("acme.com/about"), "acme.com");
  assertEquals(siteDomain("https://www.acme.com"), "acme.com");
  assertEquals(siteDomain(""), "");
  const d = citationDomains([
    "https://www.acme.com/a",
    "https://blog.acme.com/b",
    "https://acme.com/c",
    "not a url",
  ]);
  assertEquals(d, ["acme.com", "blog.acme.com"]);
  assertEquals(citesSite(d, "acme.com"), true);
  assertEquals(citesSite(["notacme.com"], "acme.com"), false);
  assertEquals(citesSite(d, ""), false);
});

Deno.test("evidenceFor picks the sentence naming the brand", () => {
  const text = "There are many options. **Acme** is the best value. Others exist.";
  assertEquals(evidenceFor(text, { name: "Acme" }), "**Acme** is the best value.");
  assertEquals(evidenceFor(text, { name: "Zeta" }), "");
});
