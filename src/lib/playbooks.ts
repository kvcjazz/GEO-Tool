// Opportunity playbooks — ported verbatim from the prototype. Matched by
// regex on the opportunity title + linked gap.

export type Playbook = { title: string; steps: string[]; k?: RegExp };

export const PLAYBOOKS: Playbook[] = [
  {
    k: /citation|cited|source|coverage|earned|press|tier|analyst/i,
    title: "Earn citations from trusted sources",
    steps: [
      "Identify the 5–10 sources each target engine cites most for this category (e.g. Wikipedia, Tier-1 press, G2, Reddit).",
      "Map which of those already mention competitors but not the client — these are the priority gaps.",
      "Pitch a data-led, quotable story or commentary to those outlets (stats + named spokesperson).",
      "Ensure any earned coverage links to and accurately describes the client's owned pages.",
      "Log the placement in PR & Influence and tag the theme so we can attribute GEO movement.",
      "Re-run the prompt set after 2–4 weeks and check citation share on the targeted engines.",
    ],
  },
  {
    k: /schema|faq|structured/i,
    title: "Add machine-readable structure",
    steps: [
      "Audit key pages for Organization, FAQPage and Article schema; note what's missing.",
      "Add FAQ blocks answering the exact buyer questions from the prompt set, in plain language.",
      "Put the definitional answer ('X is a…') in the first 1–2 sentences of each page.",
      "Validate markup and request re-crawl.",
      "Re-test brand/entity prompts to confirm improved prominence.",
    ],
  },
  {
    k: /entity|about|wikipedia|brand fact|definitive/i,
    title: "Strengthen the brand entity",
    steps: [
      "Create/refine a single authoritative 'About' page with consistent name, founders, sector and proof points.",
      "Align the description everywhere (LinkedIn, Crunchbase, directories) so engines see one consistent entity.",
      "Pursue a Wikipedia/Wikidata presence if notability criteria are met.",
      "Seed consistent boilerplate in all earned coverage.",
      "Re-test 'what is / who are' prompts to confirm accurate, favourable framing.",
    ],
  },
  {
    k: /review|g2|capterra|reddit|community/i,
    title: "Build review & community presence",
    steps: [
      "Prioritise the review/community sources your weakest engine relies on (often Perplexity → Reddit/G2).",
      "Run a structured review drive with happy clients (G2/Capterra) — aim for volume + recency.",
      "Engage authentically in relevant community threads; provide genuinely useful answers.",
      "Ensure listings carry the correct positioning and category.",
      "Track share-of-voice on the targeted engine over the next run.",
    ],
  },
  {
    k: /comparison|vs |alternativ/i,
    title: "Win comparison & alternatives queries",
    steps: [
      "Build honest 'X vs Y' and 'best [category]' pages covering the competitors in the prompt set.",
      "Include a clear comparison table with verifiable facts and a defensible point of difference.",
      "Earn third-party 'best of' inclusions where possible.",
      "Re-test comparison prompts and track position (recommended vs mentioned).",
    ],
  },
  {
    k: /accuracy|outdated|fact|hallucinat/i,
    title: "Correct inaccuracies in AI answers",
    steps: [
      "List every factual error/outdated claim surfaced in capture (with the engine + quote).",
      "Fix the source of truth (site, Wikipedia, directories) so engines re-learn correct facts.",
      "Publish an authoritative, current page covering the misreported facts.",
      "Where safe, provide correct info via channels the engine cites.",
      "Re-test and confirm the Accuracy metric improves.",
    ],
  },
  {
    k: /thought|founder|leadership|byline/i,
    title: "Founder thought-leadership programme",
    steps: [
      "Define 3–4 signature themes tied to the client's positioning and audience.",
      "Secure bylines/commentary in outlets the engines cite for this sector.",
      "Repurpose into owned long-form content with strong definitional openings.",
      "Amplify on the platforms that feed the target engines.",
      "Track sentiment and citation share against the themes.",
    ],
  },
];

export function playbookFor(o: {
  title?: string | null;
  linked_gap?: string | null;
}): Playbook {
  const hay = `${o.title || ""} ${o.linked_gap || ""}`.toString();
  for (const p of PLAYBOOKS) {
    if (p.k && p.k.test(hay)) return p;
  }
  return {
    title: "GEO execution plan",
    steps: [
      "Clarify the target metric and engine this opportunity moves.",
      "Map the sources that engine trusts for this query type.",
      "Create/earn the asset that fills the gap (content, schema, citation or coverage).",
      "Tie the activity to the client's strategy themes.",
      "Re-run the prompt set and measure the change.",
    ],
  };
}
