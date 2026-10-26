import type { Brand, Competitor, ContextItem, MediaTarget, Prompt } from "./types";

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
  },
): SetupStep[] {
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
      detail: brand.website
        ? `${brand.website} is set, so the tool can tell when AI cites the client's own site.`
        : "Add the website so the tool can tell when AI cites the client's own site.",
      status: brand.website ? "done" : "attention",
    },
    {
      id: "strategy",
      title: "Strategy & positioning",
      detail: "Objective, audience, positioning and themes. These steer every AI suggestion.",
      status: brand.objective && brand.positioning ? "done" : "review",
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
