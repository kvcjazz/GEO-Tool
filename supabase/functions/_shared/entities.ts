// Every brand an AI answer names (share of voice v2).
//
// Share of voice used to count only the competitors the team had listed, so a
// client with one listed competitor looked dominant even when answers named a
// dozen others. Here an analyst model lists every company each answer presents
// as an option, in order of first appearance, and marks the ones it recommends.
// Whether the client itself is among them is decided in code (names()), as in
// measurement, so it can't be missed or invented.
import { callAnalyst, parseJson } from "./providers.ts";
import type { UsageContext } from "./providers.ts";
import { names, type Named } from "./measure.ts";

export type Entity = { name: string; recommended: boolean; client: boolean };

export type Entities = {
  v: 1;
  /** The question names the client (answers to it don't count towards headline share of voice). */
  branded: boolean;
  model: string;
  /** One list per sample answer, brands in order of first appearance. */
  samples: Entity[][];
};

export type EntityJob = {
  /** Caller's key for this response. */
  id: string;
  question: string;
  answers: string[];
};

const MAX_CHARS = 4500;

function prompt(client: Named & { sector?: string | null }, jobs: EntityJob[]): string {
  const blocks = jobs.flatMap((j) =>
    j.answers.map((a, i) =>
      `### ${j.id}#${i}\nQUESTION: ${j.question}\nANSWER:\n${String(a || "").slice(0, MAX_CHARS)}`
    )
  );
  return (
    "You are analysing AI assistant answers for a share-of-voice study" +
    (client.sector ? ` in the sector: ${client.sector}` : "") + ".\n\n" +
    "For EACH answer below, list every company or brand the answer presents as a provider, " +
    "vendor, product or option the asker could choose — in order of first appearance. " +
    "Use each company's usual short brand name (\"State Farm\", not \"State Farm Mutual " +
    "Automobile Insurance Company\"); list a company once even if several of its products " +
    "are named. Do NOT list: publications, review or comparison sites, directories, " +
    "regulators, trade bodies, or sources merely cited. Set \"recommended\" to true when the " +
    "answer recommends it, ranks it among its top picks, or says it is best for the asker.\n\n" +
    blocks.join("\n\n") +
    '\n\nReturn ONLY a JSON object: {"answers":[{"id":"<the ### id>","brands":' +
    '[{"name":"…","recommended":true|false}]}]} with one entry per answer, in the same order. ' +
    'Use "brands":[] when an answer names none.'
  );
}

/**
 * Extracts brands for a batch of responses in one analyst call. Returns a map
 * from job id to Entities; missing ids mean the call or parse failed for them.
 */
export async function extractEntities(
  client: Named & { sector?: string | null },
  jobs: EntityJob[],
  usage?: UsageContext,
): Promise<{ out: Map<string, Entities>; error?: string; model?: string }> {
  const out = new Map<string, Entities>();
  const live = jobs.filter((j) => j.answers.some((a) => a && a.trim()));
  if (!live.length) return { out };
  const res = await callAnalyst(prompt(client, live), 12000, usage);
  if (res.error) return { out, error: res.error };
  const parsed = parseJson<{ answers?: { id?: string; brands?: { name?: string; recommended?: boolean }[] }[] }>(
    res.text,
  );
  if (!parsed?.answers) return { out, error: "entity reply could not be read" };
  const byId = new Map(parsed.answers.map((a) => [String(a.id || "").trim(), a.brands || []]));
  for (const j of live) {
    const samples: Entity[][] = j.answers.map((answer, i) => {
      const seen = new Set<string>();
      const list: Entity[] = [];
      for (const b of byId.get(`${j.id}#${i}`) || []) {
        const name = String(b?.name || "").trim().slice(0, 80);
        const key = name.toLowerCase();
        if (!name || seen.has(key)) continue;
        seen.add(key);
        list.push({ name, recommended: !!b.recommended, client: names(name, client) });
      }
      // The client counts whenever code finds it in the answer, even if the
      // model left it out.
      if (answer && names(answer, client) && !list.some((e) => e.client)) {
        list.push({ name: client.name, recommended: false, client: true });
      }
      return list;
    });
    // Only keep a job if the model answered for at least one of its samples.
    if (j.answers.some((_, i) => byId.has(`${j.id}#${i}`))) {
      out.set(j.id, { v: 1, branded: names(j.question, client), model: res.model, samples });
    }
  }
  return { out, model: res.model };
}
