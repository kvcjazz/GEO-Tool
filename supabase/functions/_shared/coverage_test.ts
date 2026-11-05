import { assertEquals } from "jsr:@std/assert@1";
import { repairPatch } from "./coverage.ts";

const base = { id: "1", url: "https://x.com/a", headline: null, activity_date: "2026-11-05", created_at: "2026-11-05T13:31:00Z" };

Deno.test("headline stored as publication is replaced, headline kept, import-day date fixed", () => {
  assertEquals(
    repairPatch(
      { ...base, outlet: "Hippo partners with Greenlight Re to link early-stage insurance investment with Spinnaker capacity" },
      { outlet: "The Insurer", headline: "Hippo partners with Greenlight Re to link early-stage insurance investment with Spinnaker capacity", date: "2026-10-30", outlet_from: "page" },
    ),
    {
      outlet: "The Insurer",
      headline: "Hippo partners with Greenlight Re to link early-stage insurance investment with Spinnaker capacity",
      activity_date: "2026-10-30",
    },
  );
});

Deno.test("unreadable page: the stored ' - Publication' suffix is used", () => {
  assertEquals(
    repairPatch(
      { ...base, outlet: "Hippo and Greenlight Re establish partnership to support emerging MGAs - Reinsurance News" },
      { outlet: "Reinsurancene", headline: null, date: null, outlet_from: "site" },
    ),
    { outlet: "Reinsurance News", headline: "Hippo and Greenlight Re establish partnership to support emerging MGAs" },
  );
});

Deno.test("a correct publication and a date the team entered are left alone", () => {
  assertEquals(
    repairPatch(
      { ...base, outlet: "Fortune", headline: "Turnaround", activity_date: "2026-05-25" },
      { outlet: "Fortune", headline: "Turnaround", date: "2026-05-24", outlet_from: "page" },
    ),
    null,
  );
});

Deno.test("site title stored as publication ('Insurtech Eye | Insurance & Risk Intelligence')", () => {
  assertEquals(
    repairPatch(
      { ...base, outlet: "Insurtech Eye | Insurance & Risk Intelligence", headline: "x" },
      { outlet: "Insurtech Eye", headline: "x", date: null, outlet_from: "page" },
    ),
    { outlet: "Insurtech Eye" },
  );
});

Deno.test("sheet headline kept when the page only gives the site name; never headline = publication", () => {
  assertEquals(
    repairPatch(
      { ...base, outlet: "Data: Nearly 80% of homeowners unprepared for extreme weather repairs" },
      { outlet: "MSN", headline: null, date: null, outlet_from: "page" },
    ),
    { outlet: "MSN", headline: "Data: Nearly 80% of homeowners unprepared for extreme weather repairs" },
  );
});

Deno.test("parent-brand name replaced when the lookup names the right publication", () => {
  assertEquals(
    repairPatch({ ...base, outlet: "FF News", headline: "x" }, { outlet: "Insurtech Eye", headline: "x", date: null, outlet_from: "ai" }),
    { outlet: "Insurtech Eye" },
  );
});
