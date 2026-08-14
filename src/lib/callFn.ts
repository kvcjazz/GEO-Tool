import type { ZodType } from "zod";
import {
  getSupabaseBrowserClient,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "./supabase/client";

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
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return schema.parse(json);
}
