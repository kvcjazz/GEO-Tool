import { assertEquals } from "jsr:@std/assert@1";
import { dateFromUrl, parsePage, splitTitle } from "./pagemeta.ts";

Deno.test("og:site_name and article:published_time", () => {
  const html = `<html><head><title>Hippo's GWP rises 60% for Q3'26 - Reinsurance News</title>
    <meta content="Reinsurance News" property="og:site_name">
    <meta property="article:published_time" content="2026-11-03T09:12:00+00:00"></head></html>`;
  assertEquals(parsePage(html, "https://www.reinsurancene.ws/hippos-gwp-rises-60-for-q326/"), {
    outlet: "Reinsurance News",
    headline: "Hippo's GWP rises 60% for Q3'26",
    date: "2026-11-03",
  });
});

Deno.test("JSON-LD publisher and datePublished win", () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
    {"@type":"NewsArticle","headline":"I'm leading a $100 million turnaround","datePublished":"2026-05-25T10:00:00Z",
     "publisher":{"@type":"Organization","name":"Fortune"}}]}</script><title>whatever | Fortune</title>`;
  assertEquals(parsePage(html, "https://fortune.com/2026/05/25/x"), {
    outlet: "Fortune",
    headline: "I'm leading a $100 million turnaround",
    date: "2026-05-25",
  });
});

Deno.test("fallbacks: title suffix and date in the address", () => {
  assertEquals(splitTitle("Hippo to Expand Homeowners Program | Insurance Innovation Reporter"), {
    headline: "Hippo to Expand Homeowners Program",
    outlet: "Insurance Innovation Reporter",
  });
  assertEquals(splitTitle("AI isn’t failing; your enterprise systems are").outlet, null);
  assertEquals(dateFromUrl("https://www.carriermanagement.com/news/2026/11/02/293152.htm"), "2026-11-02");
  assertEquals(dateFromUrl("https://www.realtytoday.com/articles/115140/20261008/storm-damage"), "2026-10-08");
  assertEquals(dateFromUrl("https://iireporter.com/hippo-to-expand-homeowners-program"), null);
  assertEquals(parsePage("<title>Blocked</title>", "https://insurance-edge.net/2026/10/30/hippo-teams-up/").date, "2026-10-30");
});

Deno.test("domain-style site name loses to the title's publication; entities decoded", () => {
  const html = `<title>Hippo&#039;s GWP rises 60% for Q3&#039;26 - Reinsurance News</title>
    <meta property="og:site_name" content="ReinsuranceNe.ws">
    <meta property="article:published_time" content="2026-10-29T10:00:00+00:00">`;
  assertEquals(parsePage(html, "https://www.reinsurancene.ws/x/"), {
    outlet: "Reinsurance News",
    headline: "Hippo's GWP rises 60% for Q3'26",
    date: "2026-10-29",
  });
  assertEquals(
    parsePage("<title>AI isn&rsquo;t failing; your enterprise systems are | TechRadar</title>", "https://www.techradar.com/pro/x").outlet,
    "TechRadar",
  );
});
