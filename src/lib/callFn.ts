import type { ZodType } from "zod";
import {
  getSupabaseBrowserClient,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "./supabase/client";

// AI functions that log their spend per client (geo_ai_usage). They take an
// optional brand_id used only to label that spend; callFn adds the selected
// client's id when the caller didn't pass one.
const SPEND_LABELLED = new Set([
  "geo-advise",
  "geo-classify-sources",
  "geo-coverage-meta",
  "geo-measure",
  "geo-news",
  "geo-radar",
  "geo-targets",
]);
let spendBrandId: string | null = null;

/** The client whose screens are open; AppState keeps it current. */
export function setSpendBrand(id: string | null): void {
  spendBrandId = id;
}

function withSpendLabel(slug: string, body: unknown): unknown {
  if (!spendBrandId || !SPEND_LABELLED.has(slug)) return body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  if ("brand_id" in body) return body;
  return { ...body, brand_id: spendBrandId };
}

// Typed wrapper around the existing Supabase Edge Functions. Attaches the
// signed-in user's access token + the anon apikey, posts JSON and validates the
// response with the supplied Zod schema. All AI keys stay server-side in
// Supabase — the Next.js app only calls these functions.
export async function callFn<T>(
  slug: string,
  body: unknown,
  schema: ZodType<T>,
): Promise<T> {
  const sb = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(withSpendLabel(slug, body)),
  });
  const json = await res.json();
  return schema.parse(json);
}
