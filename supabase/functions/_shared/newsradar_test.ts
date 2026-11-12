// Run with: deno test --allow-env _shared/
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  type Candidate,
  fromGoogle,
  inWindow,
  mergeCandidates,
  pageAgeDate,
  parseAngles,
  parseFound,
  parseRanked,
  planPrompt,
  rankPrompt,
} from "./newsradar.ts";
import { searchTerms } from "./news.ts";
import { searchSources } from "./providers.ts";

const NOW = new Date("2026-11-12T12:00:00Z");

const profile = {
  name: "Hippo",
  sector: "Home Insurance",
  market: "USA",
  themes: "Disciplined, profitable scaling — the $2B story Hippo's growth narrative is centered on disciplined scale",
  competitors: ["Lemonade", "Kin Insurance"],
  media_targets: ["Insurance Journal", "Reuters"],
};

Deno.test("long Themes text gives no sentence fragments as search terms", () => {
  assertEquals(searchTerms("AI, insurtech, fintech, founder thought-leadership"), [
    "AI",
    "insurtech",
    "fintech",
    "founder thought-leadership",
  ]);
  // A pasted narrative: only the short pieces survive, never whole sentences.
  assertEquals(
    searchTerms(
      "Unlocking Market Growth Disciplined, profitable scaling — the $2B story Hippo's growth narrative is centered on disciplined scale, not volume at any cost. Over three years",
    ),
    ["Unlocking Market Growth Disciplined", "profitable scaling"],
  );
});

Deno.test("angles: short plain queries, de-duplicated, OR and quotes removed", () => {
  const a = parseAngles(
    'Sure!\n```json\n{"angles":[{"topic":"Cat losses","query":"\\"hurricane\\" OR insured losses 2026","why":"x"},' +
      '{"topic":"dup","query":"hurricane insured losses 2026"},{"topic":"","query":""}]}\n```',
  );
  assertEquals(a.length, 1);
  assertEquals(a[0].query, "hurricane insured losses 2026");
  assertEquals(parseAngles("not json"), []);
});

Deno.test("AI-found stories need a URL its searches returned and a date in the window", () => {
  const sources = [
    { url: "https://www.reuters.com/markets/insurers-rates/", title: "Insurers raise rates", pageAge: "2 days ago" },
    { url: "https://example.com/old", title: "Old story", pageAge: "March 3, 2026" },
    { url: "https://news.test/undated", title: "Undated", pageAge: "" },
  ];
  const reply = JSON.stringify({
    stories: [
      // URL differs only by www/trailing slash: kept, with the search's URL; no date → page age.
      { title: "Insurers raise rates", url: "https://reuters.com/markets/insurers-rates", summary: "Rates up 8%." },
      // Not in the search results: dropped (could be made up).
      { title: "Invented", url: "https://made-up.test/a", date: "2026-11-10" },
      // Too old.
      { title: "Old story", url: "https://example.com/old" },
      // No date anywhere.
      { title: "Undated", url: "https://news.test/undated" },
      // Model's date wins when it is a real date in the window.
      { title: "Undated", url: "https://news.test/undated", date: "2026-11-09", about_competitor: true },
    ],
  });
  const got = parseFound(reply, sources, NOW);
  assertEquals(got.map((g) => g.title), ["Insurers raise rates", "Undated"]);
  assertEquals(got[0].url, "https://www.reuters.com/markets/insurers-rates/");
  assertEquals(got[0].domain, "reuters.com");
  assertEquals(got[0].seendate.slice(0, 10), "2026-11-10");
  assertEquals(got[0].found_by, "ai");
  assertEquals(got[1].kind, "competitor");
});

Deno.test("search sources come from every web search result block", () => {
  const s = searchSources([
    { type: "text", text: "hi" },
    {
      type: "web_search_tool_result",
      content: [{ type: "web_search_result", url: "https://a.test/1", title: "A", page_age: "1 day ago" }],
    },
    { type: "web_search_tool_result", content: { error_code: "max_uses_exceeded" } },
  ]);
  assertEquals(s, [{ url: "https://a.test/1", title: "A", pageAge: "1 day ago" }]);
});

Deno.test("page ages and the 14-day window", () => {
  assertEquals(pageAgeDate("3 days ago", NOW)?.slice(0, 10), "2026-11-09");
  assertEquals(pageAgeDate("November 1, 2026", NOW)?.slice(0, 10), "2026-11-01");
  assertEquals(pageAgeDate("", NOW), null);
  assert(inWindow("2026-10-30T00:00:00Z", NOW));
  assert(!inWindow("2026-10-20T00:00:00Z", NOW));
  assert(!inWindow("not a date", NOW));
});

Deno.test("merge: same story from Google and AI search keeps the real link and is 'both'", () => {
  const g = fromGoogle(
    [{ title: "Insurers raise rates", url: "https://news.google.com/rss/articles/x", domain: "reuters.com", seendate: "2026-11-10T08:00:00.000Z" }],
    "theme",
    "Rates",
  );
  const ai: Candidate[] = [{
    title: "Insurers Raise Rates!",
    url: "https://www.reuters.com/a",
    domain: "reuters.com",
    seendate: "2026-11-10T00:00:00.000Z",
    kind: "competitor",
    found_by: "ai",
    summary: "Rates up 8%.",
  }];
  const old = fromGoogle(
    [{ title: "Last month", url: "https://x.test", domain: "x.test", seendate: "2026-10-01T00:00:00.000Z" }],
    "theme",
  );
  const m = mergeCandidates([g, ai, old], NOW);
  assertEquals(m.length, 1);
  assertEquals(m[0].url, "https://www.reuters.com/a");
  assertEquals(m[0].found_by, "both");
  assertEquals(m[0].kind, "competitor");
  assertEquals(m[0].summary, "Rates up 8%.");
});

Deno.test("ranked picks join to numbered stories; invented numbers and empty reasons are dropped", () => {
  const cands = fromGoogle(
    [
      { title: "A", url: "https://a.test", domain: "a.test", seendate: "2026-11-10T00:00:00Z" },
      { title: "B", url: "https://b.test", domain: "b.test", seendate: "2026-11-09T00:00:00Z" },
    ],
    "theme",
  );
  const picks = parseRanked(
    JSON.stringify({
      picks: [
        { n: 2, snippet: "B happened.", pr_angle: "Comment on B.", geo_angle: "Ties to 'best home insurer'.", relevance: 9 },
        { n: 7, snippet: "?", pr_angle: "x", geo_angle: "y" },
        { n: 2, snippet: "dup", pr_angle: "x", geo_angle: "y" },
        { n: 1, snippet: "A", pr_angle: "", geo_angle: "" },
      ],
    }),
    cands,
  );
  assertEquals(picks.length, 1);
  assertEquals(picks[0].title, "B");
  assertEquals(picks[0].url, "https://b.test");
  assertEquals(picks[0].relevance, 5);
});

Deno.test("prompts carry the profile, GEO picture and numbered stories", () => {
  const brief = {
    questions: [{ text: "best home insurance for new builds", names_client: false, named: 0, answers: 6 }],
    latest_check: { gap_sources: [{ domain: "nerdwallet.com", citations: 12 }] },
  };
  const plan = planPrompt(profile, brief, NOW);
  assert(plan.includes("Today is 2026-11-12"));
  assert(plan.includes("Home Insurance"));
  assert(plan.includes("best home insurance for new builds"));
  const cands = fromGoogle(
    [{ title: "Insurers raise rates", url: "https://a.test", domain: "reuters.com", seendate: "2026-11-10T00:00:00Z" }],
    "theme",
  );
  const rank = rankPrompt(profile, brief, cands, NOW);
  assert(rank.includes("[1] (theme) Insurers raise rates — reuters.com, 2026-11-10"));
  assert(rank.includes("nerdwallet.com (12)"));
});
