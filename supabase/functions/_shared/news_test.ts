import { assertEquals } from "jsr:@std/assert@1";
import { orQuery, parseRss } from "./news.ts";

Deno.test("parseRss reads title, source domain and date", () => {
  const xml = `<rss><channel><item><title>Insurer raises rates - Reuters</title>` +
    `<link>https://news.google.com/rss/articles/abc?oc=5</link>` +
    `<pubDate>Tue, 04 Nov 2026 10:00:00 GMT</pubDate>` +
    `<source url="https://www.reuters.com">Reuters</source></item>` +
    `<item><title><![CDATA[A &amp; B merge - The Times]]></title><link>https://x.test/1</link>` +
    `<pubDate>Mon, 03 Nov 2026 10:00:00 GMT</pubDate><source url="https://thetimes.co.uk">The Times</source></item>` +
    `</channel></rss>`;
  const a = parseRss(xml);
  assertEquals(a.length, 2);
  assertEquals(a[0].title, "Insurer raises rates");
  assertEquals(a[0].domain, "reuters.com");
  assertEquals(a[0].seendate, "2026-11-04T10:00:00.000Z");
  assertEquals(a[1].title, "A & B merge");
});

Deno.test("orQuery quotes phrases and de-duplicates", () => {
  assertEquals(orQuery(["AI", "home insurance", "ai", ""]), '(AI OR "home insurance")');
  assertEquals(orQuery([]), "");
});
