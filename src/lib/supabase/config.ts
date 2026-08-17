// Resolved Supabase connection config.
//
// These are the PUBLISHABLE (anon) values — safe in the browser and already
// shipped in every client bundle; RLS enforces all access control. We fall back
// to the known project values so the build/runtime never breaks if the host
// doesn't inject the NEXT_PUBLIC_* env vars (e.g. Vercel not loading a committed
// .env.production). Set the env vars to point at a different project.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ymnulfluxjgqacodzfxq.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_S7jFJLSLAZkl65DWTXEfBQ_e1Ndm30f";
