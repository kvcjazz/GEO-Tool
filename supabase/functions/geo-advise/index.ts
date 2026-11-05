// AI strategist for the GEO tool. Two modes:
//
//   { mode: "suggest", brief, count? }
//     Proposes new questions to track for a client, the way a senior GEO + PR
//     strategist would: realistic buyer questions in the client's market,
//     weighted towards unbranded discovery, mapped to personas and buying
//     stages, and prioritised using what the latest measurement found (where
//     the client is missing, which competitors show up, which sites the
//     engines cite) and the team's strategy-call notes.
//
//   { opportunity, gap, playbook, steps, brief? }   (no mode = "tailor")
//     Turns a generic playbook into 4–6 client-specific next steps.
//
// `brief` is built by the app (src/lib/adviseBrief.ts). Older callers that send
// flat fields (brand, sector, objective, …) still work.
//
// Failures are reported, never hidden: "suggest" returns { error } instead of
// template questions, and "tailor" returns its template with `error` set.
import { callModel, CORS, envKey, json, parseJson } from "../_shared/providers.ts";
import { signedIn } from "../_shared/auth.ts";

const PTYPES = ["Category", "Comparison", "Brand/Entity", "Problem-led", "Buying-intent"];
const STAGES = ["Problem-aware", "Exploring solutions", "Shortlisting", "Deciding"];

type Brief = {
  client?: Record<string, unknown> & { name?: string };
  competitors?: { name: string; aliases?: string[]; mentions_last_check?: number | null }[];
  client_notes?: string;
  questions?: { text: string; type?: string; active?: boolean; names_client?: boolean }[];
  latest_check?: unknown;
  recent_pr?: unknown[];
};

type Body = {
  mode?: string;
  brief?: Brief;
  count?: number;
  // Legacy flat fields.
  brand?: string;
  website?: string | null;
  sector?: string | null;
  objective?: string | null;
  positioning?: string | null;
  audience?: string | null;
  themes?: string | null;
  context?: string | null;
  competitors?: string[];
  // Tailor.
  opportunity?: string;
  gap?: string | null;
  playbook?: string;
  steps?: string[];
};

/** Accept either a brief or the old flat body, and always return a brief. */
function briefOf(b: Body): Brief {
  if (b.brief && b.brief.client?.name) return b.brief;
  return {
    client: {
      name: b.brand || "",
      website: b.website || null,
      sector: b.sector || null,
      objective: b.objective || null,
      positioning: b.positioning || null,
      audience: b.audience || null,
      themes: b.themes || null,
    },
    competitors: (b.competitors || []).map((name) => ({ name })),
    client_notes: b.context || "",
    questions: [],
    latest_check: null,
    recent_pr: [],
  };
}

/** The brief as labelled sections; client notes kept as prose. */
function renderBrief(br: Brief): string {
  const { client_notes, ...rest } = br;
  return (
    "CLIENT BRIEF (JSON — empty or null fields were not filled in by the team):\n" +
    JSON.stringify(rest, null, 1) +
    "\n\nCLIENT NOTES — strategy-call transcripts, documents and the team's steer. " +
    "Lines marked [Team guidance …] are the team's explicit instructions: follow them.\n" +
    (client_notes ? String(client_notes).slice(0, 14000) : "(none yet)")
  );
}

const EXPERT =
  "You are the head of Generative Engine Optimisation (GEO) at Luminous PR, a " +
  "B2B/tech PR agency. You decide which questions the agency tracks in AI " +
  "assistants (ChatGPT, Google Gemini / AI Overviews, Perplexity, Copilot, Claude, " +
  "Grok) to show a client how visible they are and where PR can move that.";

function suggestPrompt(br: Brief, count: number): string {
  const name = br.client?.name || "the client";
  return (
    EXPERT + "\n\n" + renderBrief(br) + "\n\n" +
    `TASK: Propose ${count} NEW questions to track for ${name}.\n\n` +
    "How an expert chooses them:\n" +
    "1. Write each question exactly as a real buyer would type or say it to an AI " +
    "assistant: natural, conversational, usually 8–25 words, often with their own " +
    "situation in it (role, company size, constraint, location). Not SEO keyword strings.\n" +
    "2. Use the client's market: if a market/region is given, phrase questions as " +
    "buyers there would (local spelling, place names, regulations, currency) — " +
    "e.g. 'in the UK', 'for a German manufacturer'.\n" +
    "3. Mostly unbranded: at least two-thirds must NOT name the client. Unbranded " +
    "discovery questions are where new buyers find (or never find) a brand. The rest " +
    "may name the client (reputation, accuracy, 'X vs competitor', 'is X good for …').\n" +
    "4. Never put the client's own claims or positioning wording into an unbranded " +
    "question — that primes the answer. Ask about the buyer's need, not the client's pitch.\n" +
    "5. Cover the buying journey (Problem-aware → Exploring solutions → Shortlisting → " +
    "Deciding) and the different people involved (decision-maker, influencer, end user), " +
    "using the audience and buyer persona given.\n" +
    "6. Tie questions to the themes and positioning the client wants to own, the PR " +
    "objectives, and anything the client notes say they care about. The team's guidance " +
    "outranks your own judgement.\n" +
    "7. Use the latest check if present: favour areas where the client is missing but " +
    "competitors are named, engines where the client is weakest, and topics the gap " +
    "sources (sites the engines cite when the client is absent) cover — those are " +
    "places PR can win coverage that engines then cite.\n" +
    "8. Include 1–2 questions whose answers would show whether recent PR coverage " +
    "(recent_pr themes/outlets) is reaching AI answers.\n" +
    "9. Do not repeat or lightly reword any existing question in the brief; fill the " +
    "gaps in what is already tracked (types, stages, personas, themes).\n" +
    "10. Only questions people genuinely ask, with enough volume to matter. Rank by " +
    "impact on THIS client's objectives (5 = must track).\n\n" +
    "Return ONLY a JSON object, no prose, no code fences:\n" +
    '{"note":"2 sentences: what these questions add to what is already tracked, and the ' +
    'main visibility gap they target",' +
    '"prompts":[{"text":"the question",' +
    `"type":"one of ${PTYPES.join(" | ")}",` +
    `"stage":"one of ${STAGES.join(" | ")}",` +
    '"persona":"who asks it, 2–5 words",' +
    '"names_client":true or false,' +
    '"impact":1-5,' +
    '"reason":"one sentence on why it matters, citing the specific strategy, client ' +
    'note or result it comes from",' +
    '"lever":"one short sentence: the PR or content move most likely to get the client ' +
    'into this answer (e.g. a named outlet type, a ranking/directory, owned content, ' +
    'a spokesperson angle)"}]}'
  );
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

type Suggestion = {
  text: string;
  ptype: string;
  stage: string | null;
  persona: string | null;
  names_client: boolean;
  impact: number;
  reason: string;
  lever: string | null;
};

async function suggest(body: Body): Promise<Response> {
  const br = briefOf(body);
  if (!br.client?.name) return json({ error: "No client given." }, 400);
  const key = envKey("anthropic");
  if (!key) {
    return json({ error: "ANTHROPIC_API_KEY is not set in Supabase edge-function secrets." }, 503);
  }
  const count = Math.max(4, Math.min(20, Math.round(Number(body.count) || 12)));
  const out = await callModel("anthropic", key, suggestPrompt(br, count), 8000);
  if (out.error) return json({ error: "The AI model call failed: " + out.error }, 502);

  const parsed = parseJson<{ note?: string; prompts?: Record<string, unknown>[] }>(out.text);
  if (!parsed?.prompts?.length) {
    return json(
      { error: "The AI reply could not be read (it may have been cut off). Try again." },
      502,
    );
  }
  const seen = new Set((br.questions || []).map((q) => norm(q.text)));
  const prompts: Suggestion[] = [];
  for (const p of parsed.prompts) {
    const text = String(p.text || "").trim();
    if (!text || seen.has(norm(text))) continue;
    seen.add(norm(text));
    const type = String(p.type || p.ptype || "");
    const stage = String(p.stage || "");
    prompts.push({
      text,
      ptype: PTYPES.includes(type) ? type : "Category",
      stage: STAGES.includes(stage) ? stage : null,
      persona: p.persona ? String(p.persona).slice(0, 60) : null,
      names_client: !!p.names_client,
      impact: Math.max(1, Math.min(5, Math.round(Number(p.impact) || 3))),
      reason: String(p.reason || ""),
      lever: p.lever ? String(p.lever) : null,
    });
  }
  prompts.sort((a, b) => b.impact - a.impact);
  return json({ prompts, note: parsed.note || null, source: "ai", model: out.model });
}

function tailorTemplate(b: Body, br: Brief): string {
  const c = br.client || {};
  const themes = String(c.themes || "the priority themes");
  const aud = String(c.audience || "the target audience");
  const pos = String(c.positioning || c.objective || "the positioning");
  const s = b.steps || [];
  return [
    `Tailored guidance for ${c.name || "this client"} on the opportunity: ${b.opportunity || ""} (gap: ${b.gap || "n/a"}).`,
    "",
    `1. Anchor everything to the strategy: positioning ${pos} for ${aud}. Every asset should reinforce that.`,
    `2. Lead with the priority themes (${themes}) so this builds the reputation ${c.name || "the client"} wants in AI answers.`,
    `3. Execute the core play (${b.playbook || "the playbook"}), but target the specific outlets, communities and buyer questions ${aud} really use.`,
    s[0] ? `4. Start with: ${s[0]}` : "4. Start with the highest-impact step in the playbook.",
    `5. Prioritise the engine or source named in the gap (${b.gap || ""}) for the fastest measurable win.`,
    "6. Tie each asset to a specific question, then re-measure it to evidence the lift.",
  ].join("\n");
}

function tailorPrompt(b: Body, br: Brief): string {
  return (
    EXPERT + "\n\n" + renderBrief(br) + "\n\n" +
    `OPPORTUNITY: ${b.opportunity || ""} (gap: ${b.gap || "n/a"}).\n` +
    `GENERIC PLAYBOOK "${b.playbook || ""}": ${(b.steps || []).join("; ")}\n\n` +
    "TASK: Write 4 to 6 concrete next steps for the next two weeks that apply this " +
    "playbook to THIS client. Name specific outlet types or sites (prefer the gap " +
    "sources the engines already cite), spokesperson angles, owned content, and which " +
    "tracked questions each step should move. Follow the team's guidance in the client " +
    "notes. End with one line on how the team will see the effect in the next monthly " +
    "check. Plain numbered text only."
  );
}

async function tailor(body: Body): Promise<Response> {
  const br = briefOf(body);
  const key = envKey("anthropic");
  if (!key) {
    return json({
      guidance: tailorTemplate(body, br),
      source: "template",
      error: "ANTHROPIC_API_KEY is not set — showing the generic template.",
    });
  }
  const out = await callModel("anthropic", key, tailorPrompt(body, br), 1500);
  if (out.error || !out.text.trim()) {
    return json({
      guidance: tailorTemplate(body, br),
      source: "template",
      error: "AI tailoring failed (" + (out.error || "empty reply") + ") — showing the generic template.",
    });
  }
  return json({ guidance: out.text.trim(), source: "ai", model: out.model });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await signedIn(req))) return json({ error: "Sign-in required." }, 401);
  const body = (await req.json().catch(() => ({}))) as Body;
  return body.mode === "suggest" ? suggest(body) : tailor(body);
});
