"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

// Singleton browser client (cookie-based sessions via @supabase/ssr) so the
// server middleware and any Server Components can read the same session.
export function getSupabaseBrowserClient() {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(url, anon);
  }
  return browserClient;
}

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = anon;
