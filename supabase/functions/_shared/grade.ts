// Grading for measurement v2: prominence, sentiment and accuracy of the brand
// in an engine's answers. These need judgement, so a model gives them — the
// same engine that answered, in one call covering every sample answer that
// names the brand (it used to be one call per sample).
import { callModel, parseJson } from "./providers.ts";
import type { ProviderId, UsageContext } from "./providers.ts";
import type { Named } from "./measure.ts";

const PROMINENCE = ["Recommended", "Prominent", "Passing"];
const SENTIMENT = ["Positive", "Neutral", "Negative"];
const ACCURACY = ["Correct", "Minor error", "Major error"];

export type Grade = {
  prominence: string;
  sentiment: string | null;
  accuracy: string | null;
  accuracy_note?: string;
};

export function gradePrompt(question: string, answers: string[], brand: Named, facts: string): string {
  const aka = (brand.aliases || []).filter(Boolean);
  const many = answers.length > 1;
  return (
    "Below is a question a user asked an AI assistant, and " +
    (many
      ? answers.length + " separate answers the assistant gave to it (independent samples).\n\n"
      : "the assistant's answer.\n\n") +
    "QUESTION:\n" + question + "\n\n" +
    answers.map((a, i) => "ANSWER " + (i + 1) + ":\n" + a).join("\n\n") + "\n\n" +
    (facts
      ? "FACT SHEET for \"" + brand.name + "\", confirmed by the brand's own team. Treat it as " +
        "ground truth when judging accuracy:\n" + facts + "\n\n"
      : "") +
    'Assess how ' + (many ? "EACH answer, on its own," : "the answer") + ' presents the brand "' + brand.name + '"' +
    (aka.length ? " (also written as: " + aka.join(", ") + ")" : "") +
    ". For each answer give:\n" +
    '- "prominence": "Recommended" if the answer recommends it or ranks it among ' +
    'its top picks; "Prominent" if it is discussed with some detail but not ' +
    'recommended; "Passing" if it is only named in passing.\n' +
    '- "sentiment": "Positive", "Neutral" or "Negative" — the tone towards the brand.\n' +
    '- "accuracy": "Correct", "Minor error" or "Major error" — whether what the ' +
    "answer states about the brand is factually right" +
    (facts
      ? ", checked against the fact sheet first and your own knowledge second. A " +
        "statement that contradicts the fact sheet on what the brand does, offers or " +
        "where it operates is a Major error; a wrong or out-of-date detail is a Minor error. "
      : ", to the best of your knowledge. ") +
    'Use "Correct" when nothing stated about the brand is wrong.' +
    (facts ? '\n- "accuracy_note": one short sentence naming the error, or "" if Correct.' : "") +
    '\n\nReturn ONLY a JSON object: {"answers":[{"answer":1,"prominence":"…","sentiment":"…","accuracy":"…"' +
    (facts ? ',"accuracy_note":"…"' : "") + "}]} with one entry per answer, in order."
  );
}

function pick(value: unknown, allowed: string[]): string | null {
  const v = String(value ?? "").trim().toLowerCase();
  return allowed.find((a) => a.toLowerCase() === v) ?? null;
}

/**
 * Grades every sample answer that names the brand in ONE call to the engine's
 * own model (it used to be one call per sample). The judge is unchanged — the
 * same engine rates its answers — so scores stay comparable with earlier checks.
 */
export async function gradeAll(
  provider: ProviderId,
  key: string,
  question: string,
  answers: string[],
  brand: Named,
  facts: string,
  usage: UsageContext,
): Promise<Grade[]> {
  if (!answers.length) return [];
  const out = await callModel(provider, key, gradePrompt(question, answers, brand, facts), 1500 + 500 * answers.length, {
    usage,
  });
  const parsed = out.error ? null : parseJson<{ answers?: Record<string, unknown>[] } & Record<string, unknown>>(out.text);
  // A single answer may come back as a bare object rather than a list.
  const list: Record<string, unknown>[] = parsed?.answers && Array.isArray(parsed.answers)
    ? parsed.answers
    : parsed && answers.length === 1
    ? [parsed]
    : [];
  return answers.map((_, i) => {
    const g = list.find((x) => Number(x?.answer) === i + 1) ?? list[i] ?? null;
    return {
      // A mentioned brand is at least "Passing" even when grading fails.
      prominence: pick(g?.prominence, PROMINENCE) ?? "Passing",
      sentiment: pick(g?.sentiment, SENTIMENT),
      accuracy: pick(g?.accuracy, ACCURACY),
      accuracy_note: g?.accuracy_note ? String(g.accuracy_note).slice(0, 300) : undefined,
    };
  });
}
