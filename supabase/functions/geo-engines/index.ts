// Reports which AI engines can be queried right now, and — when one cannot —
// the exact edge-function secret that is missing, so Settings can tell the user
// what to add instead of a bare "needs key".
import {
  CORS,
  ENGINE_PROVIDER,
  ENGINES,
  json,
  KEY_ENV,
  liveEngineMap,
  liveProviders,
  MODEL_CHAIN,
  MODEL_ENV,
  PROVIDERS,
} from "../_shared/providers.ts";

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const providers = liveProviders();
  const engines = liveEngineMap();

  const missing: Record<string, string> = {};
  const keyEnv: Record<string, string> = {};
  for (const engine of ENGINES) {
    const provider = ENGINE_PROVIDER[engine];
    keyEnv[engine] = KEY_ENV[provider];
    if (!engines[engine]) missing[engine] = KEY_ENV[provider];
  }

  const models: Record<string, string> = {};
  for (const p of PROVIDERS) {
    models[p] = Deno.env.get(MODEL_ENV[p]) || MODEL_CHAIN[p][0];
  }

  return json({
    providers,
    engines,
    missing,
    key_env: keyEnv,
    models,
    live_count: ENGINES.filter((e) => engines[e]).length,
  });
});
