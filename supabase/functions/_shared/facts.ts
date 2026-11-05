// The client fact sheet (geo_brands.fact_sheet), written by the team in Client
// setup. Mirrors src/lib/factSheet.ts in the app — keep the two in step.

export const FACT_FIELDS: [key: string, label: string][] = [
  ["description", "What the company does (as it should be described)"],
  ["offerings", "Products and services"],
  ["facts", "Company facts (founded, HQ, size, ownership, locations)"],
  ["proof_points", "Proof points (clients, results, awards, numbers)"],
  ["key_messages", "Key messages"],
  ["spokespeople", "Spokespeople"],
  ["common_errors", "Things AI often gets wrong or out of date"],
  ["avoid", "Claims and topics to avoid"],
];

/** The fact sheet as labelled plain text, or "" when nothing is filled in. */
export function factSheetText(sheet: unknown, maxChars = 6000): string {
  const s = (sheet && typeof sheet === "object" ? sheet : {}) as Record<string, unknown>;
  return FACT_FIELDS
    .map(([k, label]) => {
      const v = String(s[k] ?? "").trim();
      return v ? `${label}:\n${v}` : "";
    })
    .filter(Boolean)
    .join("\n\n")
    .slice(0, maxChars);
}
