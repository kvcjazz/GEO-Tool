// Placeholder deployed over retired edge functions so their URLs stop doing
// anything. Deployed (verify_jwt on) as:
//   - geo-run-batch  v1 measurement orchestrator (primed questions, no login needed)
//   - geo-publish    wrote the old single-file app to Storage with the service role
//   - geo-pilot      served the old single-file app from the geo_app table
//   - geo-diag       probed geo-pilot
// Measurement is geo-measure via the geo_measure_jobs queue; the app is the
// Next.js site. Nothing in the app calls these.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "content-type": "application/json",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  return new Response(
    JSON.stringify({ ok: false, error: "gone", detail: "This function has been retired." }),
    { status: 410, headers: CORS },
  );
});
