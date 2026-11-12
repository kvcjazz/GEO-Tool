// Head-to-head with every brand the AI engines name: on the buyer questions
// that don't name the client, which questions does each other brand win
// (named by at least one engine) while the client is named by none?

import { namesBrand } from "./questions";
import { brandKey, categoryBrands } from "./scoring";
import type { Brand, Prompt, Response } from "./types";

type EntityJson = { samples?: { name?: string; client?: boolean; recommended?: boolean }[][] };

export type LostQuestion = { id: string; text: string; engines: string[]; recommended: boolean };

export type BrandVsClient = {
  key: string;
  name: string;
  /** In the client's tracked competitor list. */
  tracked: boolean;
  /** Share of voice on unbranded questions, 0–100 (as on the Overview). */
  share: number;
  /** Unbranded questions where this brand is named and the client isn't, by any engine. */
  lost: LostQuestion[];
  /** Unbranded questions where both are named. */
  both: number;
};

export function winsAndLosses(
  brand: Brand,
  responses: Response[],
  prompts: Prompt[],
  tracked: { name: string; aliases?: string[] | null }[],
): { rows: BrandVsClient[]; unread: number } {
  const trackedKeys = new Set(
    tracked.flatMap((c) => [c.name, ...(c.aliases || [])]).map(brandKey).filter(Boolean),
  );
  const share = new Map(categoryBrands(responses, brand.name).map((b) => [b.key, b.share]));
  const byPrompt = new Map<string, Response[]>();
  for (const r of responses) {
    const list = byPrompt.get(r.prompt_id) || [];
    list.push(r);
    byPrompt.set(r.prompt_id, list);
  }
  const rows = new Map<string, BrandVsClient & { spellings: Map<string, number> }>();
  let unread = 0;
  for (const p of prompts) {
    if (!p.active || namesBrand(p.text, brand)) continue;
    const answers = byPrompt.get(p.id) || [];
    if (!answers.length) continue;
    const clientNamed = answers.some((r) => r.mentioned);
    // brand key → engines naming it on this question, and whether any recommended it.
    const here = new Map<string, { engines: Set<string>; rec: boolean }>();
    for (const r of answers) {
      const e = r.entities as EntityJson | null;
      if (!e?.samples) {
        if (r.answer) unread++;
        continue;
      }
      for (const sample of e.samples) {
        for (const b of sample || []) {
          if (b.client || !b.name) continue;
          const k = brandKey(b.name);
          if (!k) continue;
          const cur = here.get(k) || { engines: new Set<string>(), rec: false };
          cur.engines.add(r.engine);
          cur.rec = cur.rec || !!b.recommended;
          here.set(k, cur);
          const row =
            rows.get(k) ||
            ({
              key: k,
              name: b.name,
              tracked: trackedKeys.has(k),
              share: share.get(k) || 0,
              lost: [],
              both: 0,
              spellings: new Map<string, number>(),
            } as BrandVsClient & { spellings: Map<string, number> });
          row.spellings.set(b.name, (row.spellings.get(b.name) || 0) + 1);
          rows.set(k, row);
        }
      }
    }
    for (const [k, v] of here) {
      const row = rows.get(k)!;
      if (clientNamed) row.both++;
      else row.lost.push({ id: p.id, text: p.text, engines: [...v.engines], recommended: v.rec });
    }
  }
  const out = [...rows.values()].map(({ spellings, ...r }) => ({
    ...r,
    // The most common spelling.
    name: [...spellings.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || r.name,
  }));
  out.sort((a, b) => b.lost.length - a.lost.length || b.share - a.share);
  return { rows: out, unread };
}
