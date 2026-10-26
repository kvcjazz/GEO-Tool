// Classifies the sites AI engines cite, from one client's point of view, so
// "Where to earn coverage" can leave out competitors: a PR agency won't be
// covered on another agency's blog, however often the engines cite it.
//
// One Claude call (no web search) for up to 60 domains; the app saves the
// answers in geo_source_kinds and the team can override any of them.
import { callModel, CORS, envKey, json, parseJson } from "../_shared/providers.ts";
import { signedIn } from "../_shared/auth.ts";

const KINDS = ["competitor", "media", "directory", "review", "community", "academic", "other"];

type Body = {
  brand?: string;
  website?: string | null;
  sector?: string | null;
  positioning?: string | null;
  competitors?: string[];
  domains?: string[];
};

function prompt(b: Body, domains: string[]): string {
  return (
    "You are helping a PR team decide where their client could realistically earn " +
    "coverage or a listing.\n\n" +
    `CLIENT: ${b.brand}` +
    (b.website ? ` (${b.website})` : "") +
    (b.sector ? `\nSECTOR: ${b.sector}` : "") +
    (b.positioning ? `\nPOSITIONING: ${b.positioning}` : "") +
    (b.competitors?.length ? `\nKNOWN COMPETITORS: ${b.competitors.join(", ")}` : "") +
    "\n\nFor each website domain below, say what kind of site it is from this client's " +
    "point of view:\n" +
    '- "competitor": a business selling the same kind of services as the client ' +
    "(e.g. another agency in the same field), including its blog. The client would " +
    "not get coverage there.\n" +
    '- "media": a news site, trade publication, magazine or independent blog.\n' +
    '- "directory": a listing, ranking or comparison site (e.g. Clutch).\n' +
    '- "review": a review platform (e.g. G2, Trustpilot).\n' +
    '- "community": a forum or community (e.g. Reddit).\n' +
    '- "academic": a journal, university or research archive.\n' +
    '- "other": anything else, including the client\'s own site.\n' +
    "If you don't recognise a domain, judge from its name and the client's sector.\n\n" +
    "DOMAINS:\n" + domains.join("\n") + "\n\n" +
    'Return ONLY a JSON object: {"sites":[{"domain":"…","kind":"…","label":"a 1–4 word ' +
    'description, e.g. PR agency, Trade publication"}]} covering every domain once.'
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await signedIn(req))) return json({ ok: false, error: "sign-in required" }, 401);

  const body = await req.json().catch(() => ({})) as Body;
  const domains = [
    ...new Set((body.domains || []).map((d) => String(d).trim().toLowerCase()).filter(Boolean)),
  ].slice(0, 60);
  if (!body.brand || !domains.length) {
    return json({ ok: false, error: "brand and domains required" });
  }
  const key = envKey("anthropic");
  if (!key) return json({ ok: false, error: "no_key", detail: "Missing ANTHROPIC_API_KEY" });

  const out = await callModel("anthropic", key, prompt(body, domains), 4000);
  if (out.error) return json({ ok: false, error: "call_failed", detail: out.error });
  const parsed = parseJson<{ sites?: { domain?: string; kind?: string; label?: string }[] }>(
    out.text,
  );
  const wanted = new Set(domains);
  const sites = (parsed?.sites || [])
    .map((s) => ({
      domain: String(s.domain || "").trim().toLowerCase(),
      kind: KINDS.includes(String(s.kind)) ? String(s.kind) : "other",
      label: String(s.label || "").slice(0, 40) || null,
    }))
    .filter((s) => wanted.has(s.domain));
  return json({ ok: true, model: out.model, sites });
});
