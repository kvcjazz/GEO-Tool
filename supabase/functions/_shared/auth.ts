// Caller checks shared by the GEO edge functions.

/** True when the request carries a signed-in user's access token. */
export async function signedIn(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") || "";
  if (!/^bearer\s+\S+/i.test(auth)) return false;
  const apikey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const r = await fetch((Deno.env.get("SUPABASE_URL") || "") + "/auth/v1/user", {
    headers: { apikey, authorization: auth },
  });
  await r.body?.cancel();
  return r.ok;
}
