import type { Brand, Prompt, Response } from "./types";

// Splits tracked questions into the two kinds the Overview reports on:
// questions that name the client ("is Luminous PR any good") and questions
// that don't ("best tech PR agencies UK"). Being named in the second kind is
// how new buyers find a brand; the first only shows recognition.

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word, case-insensitive match — the same rule geo-measure uses. */
function nameRegex(name: string): RegExp | null {
  const words = name.trim().split(/[\s-]+/).filter(Boolean).map(escapeRe);
  if (!words.length) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])${words.join("[\\s-]+")}(?![\\p{L}\\p{N}])`, "iu");
}

/** True when the question names the brand (or one of its aliases). */
export function namesBrand(text: string, brand: Pick<Brand, "name" | "aliases">): boolean {
  return [brand.name, ...(brand.aliases || [])].some(
    (n) => !!n && (nameRegex(n)?.test(text) ?? false),
  );
}

export type Reach = {
  /** Answers in this group that named the brand. */
  named: number;
  /** Answers in this group. */
  answers: number;
  /** Distinct questions in this group. */
  questions: number;
  pct: number;
};

/** Mention rate on questions that don't name the brand vs ones that do. */
export function reachSplit(
  brand: Brand,
  prompts: Prompt[],
  responses: Response[],
): { newBuyers: Reach; byName: Reach } {
  const branded = new Map(prompts.map((p) => [p.id, namesBrand(p.text, brand)]));
  const group = (wantBranded: boolean): Reach => {
    const rows = responses.filter((r) => (branded.get(r.prompt_id) ?? false) === wantBranded);
    const named = rows.filter((r) => r.mentioned).length;
    return {
      named,
      answers: rows.length,
      questions: new Set(rows.map((r) => r.prompt_id)).size,
      pct: rows.length ? Math.round((named / rows.length) * 100) : 0,
    };
  };
  return { newBuyers: group(false), byName: group(true) };
}
