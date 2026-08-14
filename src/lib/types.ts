import type { Database } from "./database.types";

type Tables = Database["public"]["Tables"];

export type Brand = Tables["geo_brands"]["Row"];
export type Competitor = Tables["geo_competitors"]["Row"];
export type Prompt = Tables["geo_prompts"]["Row"];
export type Run = Tables["geo_runs"]["Row"];
export type Response = Tables["geo_responses"]["Row"];
export type CompetitorSov = Tables["geo_competitor_sov"]["Row"];
export type Opportunity = Tables["geo_opportunities"]["Row"];
export type PrActivity = Tables["geo_pr_activity"]["Row"];
export type Mention = Tables["geo_mentions"]["Row"];
export type MediaTarget = Tables["geo_media_targets"]["Row"];
export type ContextItem = Tables["geo_context"]["Row"];
export type RadarItem = Tables["geo_radar_items"]["Row"];
export type NewsItem = Tables["geo_news"]["Row"];

export type EngineStatus = Record<string, boolean>;

export type MemoryOutlet = {
  outlet: string;
  up: number;
  down: number;
  landed: number;
  cited: number;
  score: number;
};

export type DateRange = {
  mode: "all" | "1" | "3" | "12" | "custom";
  from: string | null;
  to: string | null;
};
