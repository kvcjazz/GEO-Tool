// Fills geo_responses.entities (every brand each answer names — share of
// voice v2) for answers measured before geo-measure started doing it, or where
// extraction failed. Works through one client's measurement-v2 answers in
// batches until done or out of time, and reports how many remain so the
// caller can run it again.
//
// Callers: a signed-in user who can edit the client, or the cron secret
// (x-geo-cron, see geo-listen) for server-side backfills.
import { CORS, json } from "../_shared/providers.ts";
import { signedIn } from "../_shared/auth.ts";
import { extractEntities, type EntityJob } from "../_shared/entities.ts";

const SB = Deno.env.get("SUPABASE_URL") || "";
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function rest(path: string, init: { method?: string; body?: unknown; auth?: string; apikey?: string } = {}) {
  return fetch(SB + "/rest/v1/" + path, {
    method: init.method || "GET",
    headers: {
      apikey: init.apikey || SR,
      authorization: init.auth || "Bearer " + SR,
      "content-type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

/** Cron secret, or a signed-in user allowed to edit this client. */
async function allowed(req: Request, bid: string): Promise<boolean> {
  const sent = req.headers.get("x-geo-cron") || "";
  if (sent) {
    const r = await rest("rpc/geo_cron_secret_ok", { method: "POST", body: { s: sent } });
    if (r.ok && (await r.json()) === true) return true;
  }
  if (!(await signedIn(req))) return false;
  const r = await rest("rpc/geo_can_edit_brand", {
    method: "POST",
    body: { bid },
    auth: req.headers.get("authorization") || "",
    apikey: req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "",
  });
  return r.ok && (await r.json()) === true;
}

type Row = { id: string; prompt_id: string; raw: unknown; answer: string | null };

const BATCH = 3; // responses per analyst call
const PARALLEL = 4; // calls at once
const BUDGET_MS = 110_000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const body = (await req.json().catch(() => ({}))) as { brand_id?: string };
  const bid = String(body.brand_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(bid)) return json({ ok: false, error: "brand_id required" }, 400);
  if (!(await allowed(req, bid))) return json({ ok: false, error: "Not allowed." }, 401);

  const brand = (await (await rest(`geo_brands?id=eq.${bid}&select=name,aliases,sector`)).json())[0] as
    | { name: string; aliases: string[] | null; sector: string | null }
    | undefined;
  if (!brand) return json({ ok: false, error: "brand not found" }, 404);
  const client = { name: brand.name.trim(), aliases: brand.aliases || [], sector: brand.sector };

  const runs = (await (await rest(`geo_runs?brand_id=eq.${bid}&method=eq.v2&select=id`)).json()) as { id: string }[];
  if (!runs.length) return json({ ok: true, processed: 0, remaining: 0 });
  const runList = runs.map((r) => r.id).join(",");
  const prompts = (await (await rest(`geo_prompts?brand_id=eq.${bid}&select=id,text`)).json()) as {
    id: string;
    text: string;
  }[];
  const qText = new Map(prompts.map((p) => [p.id, p.text]));

  const started = Date.now();
  let processed = 0;
  const errors: string[] = [];
  const skipped = new Set<string>();

  while (Date.now() - started < BUDGET_MS - 40_000) {
    const exclude = skipped.size ? `&id=not.in.(${[...skipped].join(",")})` : "";
    const rows = (await (await rest(
      `geo_responses?run_id=in.(${runList})&entities=is.null&engine=neq.Copilot${exclude}` +
        `&select=id,prompt_id,raw,answer&limit=${BATCH * PARALLEL}`,
    )).json()) as Row[];
    if (!rows.length) break;

    const jobs: EntityJob[] = rows.map((r) => {
      const samples = Array.isArray(r.raw) ? (r.raw as { answer?: string }[]) : [];
      const answers = samples.map((s) => String(s?.answer || "")).filter(Boolean);
      return {
        id: r.id,
        question: qText.get(r.prompt_id) || "",
        answers: answers.length ? answers : r.answer ? [r.answer] : [],
      };
    });
    const batches: EntityJob[][] = [];
    for (let i = 0; i < jobs.length; i += BATCH) batches.push(jobs.slice(i, i + BATCH));

    const results = await Promise.all(batches.map((b) => extractEntities(client, b)));
    for (let i = 0; i < batches.length; i++) {
      const res = results[i];
      if (res.error) errors.push(res.error);
      for (const j of batches[i]) {
        const e = res.out.get(j.id);
        if (e) {
          const w = await rest(`geo_responses?id=eq.${j.id}`, { method: "PATCH", body: { entities: e } });
          if (w.ok) processed++;
          else skipped.add(j.id);
        } else if (!j.answers.length) {
          // No answer text to read: record an empty result so it isn't retried forever.
          await rest(`geo_responses?id=eq.${j.id}`, {
            method: "PATCH",
            body: { entities: { v: 1, branded: false, model: "", samples: [] } },
          });
        } else {
          skipped.add(j.id);
        }
      }
    }
    // Every provider failing: stop rather than burn the time budget.
    if (results.every((r) => r.error)) break;
  }

  const countRes = await fetch(
    SB + `/rest/v1/geo_responses?run_id=in.(${runList})&entities=is.null&engine=neq.Copilot&select=id`,
    { method: "HEAD", headers: { apikey: SR, authorization: "Bearer " + SR, prefer: "count=exact" } },
  );
  const remaining = Number((countRes.headers.get("content-range") || "*/0").split("/")[1]) || 0;

  return json({ ok: true, processed, remaining, errors: [...new Set(errors)].slice(0, 5) });
});
