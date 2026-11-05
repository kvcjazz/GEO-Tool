// The client fact sheet (geo_brands.fact_sheet): the team's ground truth about
// the client. Every AI step reads it, and geo-measure judges the accuracy of
// AI answers against it. Mirrors supabase/functions/_shared/facts.ts.

export const FACT_FIELDS: { key: string; label: string; hint: string }[] = [
  {
    key: "description",
    label: "What the company does",
    hint: "One or two sentences, exactly as you want AI engines to describe them.",
  },
  { key: "offerings", label: "Products and services", hint: "Names and one line each." },
  {
    key: "facts",
    label: "Company facts",
    hint: "Founded, HQ, size, ownership, offices, markets served.",
  },
  {
    key: "proof_points",
    label: "Proof points",
    hint: "Named clients, results, awards, rankings, numbers you can stand behind.",
  },
  { key: "key_messages", label: "Key messages", hint: "What we want to be known for." },
  { key: "spokespeople", label: "Spokespeople", hint: "Name, title, what they can speak on." },
  {
    key: "common_errors",
    label: "Things AI gets wrong",
    hint: "Out-of-date or wrong facts engines repeat (old name, old pricing, a product you dropped).",
  },
  { key: "avoid", label: "Avoid", hint: "Claims, topics or comparisons not to make." },
];

export type FactSheet = Record<string, string>;

export function factSheetOf(raw: unknown): FactSheet {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: FactSheet = {};
  for (const f of FACT_FIELDS) out[f.key] = String(s[f.key] ?? "");
  return out;
}

/** The fact sheet as labelled plain text, or "" when nothing is filled in. */
export function factSheetText(raw: unknown, maxChars = 6000): string {
  const s = factSheetOf(raw);
  return FACT_FIELDS.map((f) => (s[f.key].trim() ? `${f.label}:\n${s[f.key].trim()}` : ""))
    .filter(Boolean)
    .join("\n\n")
    .slice(0, maxChars);
}

/** How many fact-sheet sections have something in them. */
export function factSheetFilled(raw: unknown): number {
  const s = factSheetOf(raw);
  return FACT_FIELDS.filter((f) => s[f.key].trim()).length;
}

/** Common markets, as ISO 3166-1 alpha-2 codes for the engines' search location. */
export const MARKETS: [code: string, name: string][] = [
  ["GB", "United Kingdom"],
  ["US", "United States"],
  ["IE", "Ireland"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["NL", "Netherlands"],
  ["ES", "Spain"],
  ["IT", "Italy"],
  ["SE", "Sweden"],
  ["CH", "Switzerland"],
  ["CA", "Canada"],
  ["AU", "Australia"],
  ["SG", "Singapore"],
  ["AE", "United Arab Emirates"],
  ["IN", "India"],
];
