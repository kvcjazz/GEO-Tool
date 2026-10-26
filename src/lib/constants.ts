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

// Sidebar nav: [view, icon, label, visibility]
export const NAVDEF: [string, string, string, "both" | "team"][] = [
  ["dashboard", "▣", "Dashboard", "both"],
  ["capture", "✎", "Response Capture", "team"],
  ["prompts", "≣", "Prompt Set", "team"],
  ["backlog", "★", "Opportunity Backlog", "both"],
  ["planning", "◉", "PR Planning", "team"],
  ["sources", "❖", "Source Intel", "team"],
  ["pr", "◈", "PR & Influence", "both"],
  ["listening", "◎", "Listening", "both"],
  ["settings", "⚙", "Settings", "team"],
];

export const TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  capture: "Response Capture",
  prompts: "Prompt Set",
  backlog: "Opportunity Backlog",
  planning: "PR Planning",
  sources: "Source Intel",
  pr: "PR & Influence",
  listening: "Listening",
  settings: "Settings",
};

export const CLIENT_VIEWS = ["dashboard", "backlog", "pr", "listening"];
