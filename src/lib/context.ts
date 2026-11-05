import type { ContextItem } from "./types";

// Port of ctxString() — flattens strategy context + team guidance for the AI,
// capped at maxChars (6000 by default).
export function ctxString(items: ContextItem[], maxChars = 6000): string {
  return (items || [])
    .map((c) => {
      const nl = "\n";
      const g = c.guidance
        ? `[Team guidance on how to use this — prioritise this steer: ${c.guidance}]${nl}`
        : "";
      return g + c.title + nl + (c.content || "");
    })
    .join("\n\n")
    .slice(0, maxChars);
}
