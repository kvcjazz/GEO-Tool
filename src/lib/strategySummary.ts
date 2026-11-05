import type { getSupabaseBrowserClient } from "./supabase/client";
import type { Brand } from "./types";
import type { BrandData } from "@/state/AppState";
import { buildAdviseBrief } from "./adviseBrief";
import { callFn } from "./callFn";
import { AdviseSummarySchema } from "./schemas";

// The visibility-strategy summary on the Overview (geo_brands.strategy_summary).
// The AI writes it from the strategy and PR profile in Client setup; the team
// can edit it. It is stored as plain text: the first line is the headline and
// each "- " line is a bullet, so it is easy to edit in a text box.

/** Client setup fields the summary is written from (mirrors geo-advise). */
const SOURCE_FIELDS = [
  "name",
  "sector",
  "pr_region",
  "objective",
  "audience",
  "positioning",
  "themes",
  "pr_persona",
  "pr_journey",
  "pr_objectives",
  "pr_newsworthy",
] as const;

/** True when Client setup has any strategy to summarise. */
export function hasStrategy(brand: Brand): boolean {
  return !!(brand.objective || brand.positioning || brand.audience || brand.themes);
}

/**
 * A fingerprint of the fields the summary is written from, so the Overview can
 * tell when Client setup has changed since the summary was written.
 */
export function strategySource(brand: Brand): string {
  const text = SOURCE_FIELDS.map((k) => String(brand[k] ?? "").trim()).join("␟");
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return "v1:" + (h >>> 0).toString(36);
}

/** Summary text → headline + bullets. */
export function parseSummary(text: string): { headline: string; points: string[] } {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const isPoint = (l: string) => /^[-•*]\s/.test(l);
  const strip = (l: string) => l.replace(/^[-•*]\s+/, "");
  // The first plain line is the headline; if every line is a bullet, the first one.
  const i = Math.max(0, lines.findIndex((l) => !isPoint(l)));
  const headline = lines.length ? strip(lines[i]) : "";
  const points = lines.filter((_, k) => k !== i).map(strip).filter(Boolean);
  return { headline, points };
}

export function formatSummary(headline: string, points: string[]): string {
  return [headline.trim(), ...points.map((p) => "- " + p.trim())].join("\n");
}

/** What the Overview should do with the stored summary. */
export function summaryState(brand: Brand): "missing" | "stale" | "outdated-edit" | "ok" {
  if (!brand.strategy_summary?.trim()) return "missing";
  if (brand.strategy_summary_source === strategySource(brand)) return "ok";
  return brand.strategy_summary_edited ? "outdated-edit" : "stale";
}

export type BrandPatch = Pick<
  Brand,
  "strategy_summary" | "strategy_summary_source" | "strategy_summary_edited"
>;

/** Save summary fields; returns false when the account can't edit this client. */
export async function saveSummary(
  sb: ReturnType<typeof getSupabaseBrowserClient>,
  brandId: string,
  patch: BrandPatch,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await sb
    .from("geo_brands")
    .update(patch)
    .eq("id", brandId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "your account can't edit this client" };
  return { ok: true };
}

// One request per client + strategy version, however many screens ask at once.
const inFlight = new Map<string, Promise<{ patch?: BrandPatch; error?: string }>>();

/**
 * Asks the AI for a fresh summary of the strategy in Client setup. Returns the
 * fields to store; saving is left to the caller so it can patch app state.
 */
export function writeSummary(
  brand: Brand,
  data: BrandData,
): Promise<{ patch?: BrandPatch; error?: string }> {
  const source = strategySource(brand);
  const key = brand.id + "|" + source;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const p = (async () => {
    try {
      const j = await callFn(
        "geo-advise",
        { mode: "summary", brief: buildAdviseBrief(brand, data) },
        AdviseSummarySchema,
      );
      if (j.error || !j.headline) return { error: j.error || "empty reply" };
      return {
        patch: {
          strategy_summary: formatSummary(j.headline, j.points || []),
          strategy_summary_source: source,
          strategy_summary_edited: false,
        },
      };
    } catch (e) {
      return { error: String(e) };
    } finally {
      // Let a later "Regenerate" ask again.
      setTimeout(() => inFlight.delete(key), 0);
    }
  })();
  inFlight.set(key, p);
  return p;
}
