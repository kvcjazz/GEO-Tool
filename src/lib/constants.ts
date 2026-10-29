// Scoring constants — ported verbatim from the prototype. Do NOT change
// these values or the default weights: the scoring model is the credibility
// core of the product and must reproduce the prototype exactly.

export const ENGINES = [
  "ChatGPT",
  "Google AI / Gemini",
  "Perplexity",
  "Copilot",
  "Claude",
  "Grok",
] as const;
export type Engine = (typeof ENGINES)[number];

export const PROM: Record<string, number> = {
  Recommended: 100,
  Prominent: 67,
  Passing: 33,
  Absent: 0,
};
export const SENT: Record<string, number> = {
  Positive: 100,
  Neutral: 60,
  Negative: 0,
};
export const ACC: Record<string, number> = {
  Correct: 100,
  "Minor error": 50,
  "Major error": 0,
};

export const PROM_OPTS = ["Recommended", "Prominent", "Passing", "Absent"];
export const SENT_OPTS = ["Positive", "Neutral", "Negative"];
export const ACC_OPTS = ["Correct", "Minor error", "Major error"];
export const CITE_OPTS = ["Yes", "No", "n/a"];
export const PTYPES = [
  "Category",
  "Comparison",
  "Brand/Entity",
  "Problem-led",
  "Buying-intent",
];

export type MetricWeights = {
  mention: number;
  sov: number;
  citation: number;
  position: number;
  sentiment: number;
  accuracy: number;
};

export const DEFAULT_METRIC_WEIGHTS: MetricWeights = {
  mention: 25,
  sov: 25,
  citation: 20,
  position: 15,
  sentiment: 10,
  accuracy: 5,
};

export const DEFAULT_ENGINE_WEIGHTS: Record<string, number> = {
  ChatGPT: 30,
  "Google AI / Gemini": 22,
  Perplexity: 18,
  Copilot: 12,
  Claude: 10,
  Grok: 8,
};

export const METRIC_KEYS: (keyof MetricWeights)[] = [
  "mention",
  "sov",
  "citation",
  "position",
  "sentiment",
  "accuracy",
];

export const METRIC_LABELS: Record<keyof MetricWeights, string> = {
  mention: "Mention Rate",
  sov: "Share of Voice",
  citation: "Citation Share",
  position: "Position",
  sentiment: "Sentiment",
  accuracy: "Accuracy",
};

// ---- Navigation ----------------------------------------------------------
// The app is organised around the monthly cycle — measure, understand, act,
// prove impact — plus Setup and Admin. Each area says what question it answers
// and what to do there, so nobody has to guess what a tab is for.

export type AreaId = "overview" | "answers" | "plan" | "coverage" | "setup" | "admin";

/** The main button in an area's page header. */
export type AreaAction = "snapshot" | "remeasure" | "logPlacement";

export type Area = {
  id: AreaId;
  label: string;
  /** Label in client view, when it differs. */
  clientLabel?: string;
  /** One line under the label in the sidebar. */
  desc: string;
  group: "cycle" | "setup";
  /** Shown in client (presentation) view. */
  client: boolean;
  /** What the page answers. */
  question: string;
  clientQuestion?: string;
  /** What to do here (team view only). */
  todo: string;
  action?: { kind: AreaAction; label: string };
  tabs?: { id: string; label: string; hint: string }[];
};

export const AREAS: Area[] = [
  {
    id: "overview",
    label: "Overview",
    desc: "Score, what changed, top actions",
    group: "cycle",
    client: true,
    question: "How visible is this client in AI answers, and what should we do about it?",
    todo: "Start here each month: check the two headline numbers, then open the top actions.",
    action: { kind: "snapshot", label: "Run monthly check" },
  },
  {
    id: "answers",
    label: "AI answers",
    desc: "What each engine says about you",
    group: "cycle",
    client: false,
    question: "What do the AI engines actually say when buyers ask our questions?",
    todo: "Read the answers behind the score, see which sites the engines trust, and correct any rating that looks wrong.",
    action: { kind: "remeasure", label: "Re-measure now" },
    tabs: [
      {
        id: "answers",
        label: "Answers",
        hint: "Every question we track, and which engines named this client when asked it.",
      },
      {
        id: "sources",
        label: "Sources AI trusts",
        hint: "The sites the engines cited in their answers — where this client already is, and where it needs to be.",
      },
      {
        id: "mentions",
        label: "Other mentions",
        hint: "Mentions found outside the tracked questions: open questions to the engines, plus news.",
      },
    ],
  },
  {
    id: "plan",
    label: "Plan",
    clientLabel: "Plan progress",
    desc: "Ideas and the actions we're taking",
    group: "cycle",
    client: true,
    question: "What should we do next to get named more often?",
    clientQuestion: "What we are doing to raise your visibility, and how far along it is.",
    todo: "Triage new ideas into the plan, then update each action's status as work progresses.",
    tabs: [
      {
        id: "ideas",
        label: "Ideas inbox",
        hint: "New suggestions from the Radar briefing. Add the good ones to the plan — rating them teaches the Radar.",
      },
      {
        id: "actions",
        label: "Action plan",
        hint: "Everything we've committed to, ranked by impact ÷ effort.",
      },
    ],
  },
  {
    id: "coverage",
    label: "Coverage & impact",
    desc: "PR the AI engines now cite",
    group: "cycle",
    client: true,
    question: "Is our PR coverage being cited by the AI engines?",
    todo: "Log each placement — the tool checks every AI answer for it automatically.",
    action: { kind: "logPlacement", label: "Log a placement" },
  },
  {
    id: "setup",
    label: "Client setup",
    desc: "Brand, questions, competitors",
    group: "setup",
    client: false,
    question: "Is this client set up well enough to measure properly?",
    todo: "Work down the checklist. Anything marked “Needs attention” is skewing the results.",
  },
  {
    id: "admin",
    label: "Admin",
    desc: "Weights, engines, users",
    group: "setup",
    client: false,
    question: "Settings you rarely need.",
    todo: "Scoring weights, AI engines, users, data tools, and adding or archiving clients.",
  },
];

export const CLIENT_AREAS: AreaId[] = AREAS.filter((a) => a.client).map((a) => a.id);

/** Old tab ids (links, bookmarks, older code paths) → their new home. */
export const LEGACY_VIEWS: Record<string, { area: AreaId; tab?: string }> = {
  dashboard: { area: "overview" },
  capture: { area: "answers", tab: "answers" },
  sources: { area: "answers", tab: "sources" },
  listening: { area: "answers", tab: "mentions" },
  planning: { area: "plan", tab: "ideas" },
  backlog: { area: "plan", tab: "actions" },
  pr: { area: "coverage" },
  prompts: { area: "setup" },
  settings: { area: "setup" },
};
