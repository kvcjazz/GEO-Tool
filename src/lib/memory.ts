import type { MemoryOutlet } from "./types";

/** The agency-wide outlet track record, as a line of text for the AI prompts. */
export function memoryText(memory: MemoryOutlet[] | null): string {
  const a = memory || [];
  if (!a.length) return "";
  const proven = a
    .filter((o) => o.score > 0)
    .slice(0, 10)
    .map(
      (o) =>
        o.outlet +
        (o.landed
          ? " (landed" + (o.cited ? "+cited by AI" : "") + ")"
          : o.up
            ? " (rated realistic)"
            : ""),
    )
    .join("; ");
  const avoid = a
    .filter((o) => o.score < 0)
    .slice(0, 8)
    .map((o) => o.outlet + " (rated unrealistic/dismissed)")
    .join("; ");
  let t = "";
  if (proven) t += "PROVEN / likely to work: " + proven + ". ";
  if (avoid) t += "AVOID / has not worked: " + avoid + ".";
  return t;
}
