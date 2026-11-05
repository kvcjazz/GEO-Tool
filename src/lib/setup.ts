import type { Brand, Competitor, ContextItem, MediaTarget, Prompt, SearchTerm } from "./types";
import { FACT_FIELDS, factSheetFilled } from "./factSheet";

// The Client setup checklist: what a client needs before the monthly check
// gives trustworthy numbers. Each step anchors to its section on the page.

export type StepStatus = "done" | "attention" | "review";

export type SetupStep = {
  id: string;
  title: string;
  detail: string;
  status: StepStatus;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function setupSteps(
  brand: Brand,
  d: {
    competitors: Competitor[];
    prompts: Prompt[];
    media: MediaTarget[];
    context: ContextItem[];
    searchTerms?: SearchTerm[];
  },
): SetupStep[] {
  const seoTerms = d.searchTerms?.length || 0;
  const seoQuestions = d.prompts.filter((p) => p.seo_seed).length;
  const active = d.prompts.filter((p) => p.active);
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const p of active) {
    const k = norm(p.text);
    if (seen.has(k)) dupes.add(p.text.trim());
    seen.add(k);
  }
  // Answers often drop a suffix ("Tyto" for "Tyto PR"); a multi-word name with
  // no alias is likely to be missed when an engine does name it.
  const noShortName = d.competitors.filter(
    (c) => c.name.trim().split(/\s+/).length > 1 && !(c.aliases || []).length,
  );

  return [
    {
      id: "brand",
      title: "Brand & website",
      detail:
        (brand.website
          ? `${brand.website} is set, so the tool can tell when AI cites the client's own site.`
          : "Add the website so the tool can tell when AI cites the client's own site.") +
        (brand.market_country
          ? ` Engines search from ${brand.market_country}.`
          : " No main market set, so engines search from their default (usually the US)."),
      status: brand.website ? "done" : "attention",
    },
    {
      id: "strategy",
      title: "Strategy & positioning",
      detail: "Objective, audience, positioning and themes. These steer every AI suggestion.",
      status: brand.objective && brand.positioning ? "done" : "review",
    },
    {
      id: "facts",
      title: "Client fact sheet",
      detail: (() => {
        const n = factSheetFilled(brand.fact_sheet);
        return n
          ? `${n} of ${FACT_FIELDS.length} sections filled. Used to check whether AI answers about the client are accurate.`
          : "Empty — add what the company does, its offerings and key facts so the monthly check can catch AI getting them wrong.";
      })(),
      status: factSheetFilled(brand.fact_sheet) >= 3 ? "done" : factSheetFilled(brand.fact_sheet) ? "review" : "attention",
    },
    {
      id: "competitors",
      title: "Competitors",
      detail: !d.competitors.length
        ? "None tracked yet — add the agencies or brands this client competes with."
        : noShortName.length
          ? `${d.competitors.length} tracked. Add the short names answers use for ${noShortName
              .map((c) => c.name)
              .join(", ")} (e.g. “${noShortName[0].name.split(/\s+/)[0]}”) under “Also known as”.`
          : `${d.competitors.length} tracked.`,
      status: !d.competitors.length || noShortName.length ? "attention" : "done",
    },
    {
      id: "search",
      title: "Search demand (SEO input, optional)",
      detail: seoTerms
        ? `${seoTerms} Google search terms imported; ${seoQuestions} tracked question${
            seoQuestions === 1 ? "" : "s"
          } drafted from them. Helps choose questions only — not part of the GEO score.`
        : "Import the client's Search Console or keyword data to draft AI questions from what people actually search for. Optional; not part of the GEO score.",
      status: seoTerms ? "done" : "review",
    },
    {
      id: "questions",
      title: "Questions we track",
      detail: !active.length
        ? "No active questions — add the questions buyers ask AI about this category."
        : dupes.size
          ? `${active.length} active. ${dupes.size} duplicated: ${[...dupes]
              .map((t) => `“${t}”`)
              .join(", ")}.`
          : `${active.length} active.`,
      status: !active.length || dupes.size ? "attention" : "done",
    },
    {
      id: "media",
      title: "Media targets & PR profile",
      detail: "The outlets and story angles the Radar aims its ideas at.",
      status: d.media.length && (brand.pr_objectives || brand.pr_region) ? "done" : "review",
    },
    {
      id: "docs",
      title: "Background documents",
      detail: d.context.length
        ? `${d.context.length} added. Call notes, decks and transcripts make AI suggestions specific to this client.`
        : "Add call notes, strategy decks or transcripts so AI suggestions are specific to this client.",
      status: d.context.length ? "done" : "review",
    },
  ];
}
