import { z } from "zod";

// Zod schemas that parse the loosely-typed edge-function JSON responses (§7 of
// the handoff). Unknown keys are stripped; we validate only what the UI uses.

export const EngineStatusSchema = z.object({
  providers: z.record(z.string(), z.boolean()).optional(),
  engines: z.record(z.string(), z.boolean()).optional(),
});
export type EngineStatusResp = z.infer<typeof EngineStatusSchema>;

export const NewsArticleSchema = z.object({
  title: z.string().nullish(),
  url: z.string().nullish(),
  domain: z.string().nullish(),
  seendate: z.string().nullish(),
});

export const NewsResponseSchema = z.object({
  articles: z.array(NewsArticleSchema).nullish(),
  competitorNews: z.array(NewsArticleSchema).nullish(),
  query: z.string().nullish(),
});
export type NewsResponse = z.infer<typeof NewsResponseSchema>;

export const RadarItemSchema = z.object({
  stream: z.string().nullish(),
  title: z.string().nullish(),
  idea: z.string().nullish(),
  target_outlets: z.string().nullish(),
  hook: z.string().nullish(),
  rationale: z.string().nullish(),
  impact: z.union([z.number(), z.string()]).nullish(),
  geo_metric: z.string().nullish(),
  feasibility: z.string().nullish(),
});

export const RadarResponseSchema = z.object({
  items: z.array(RadarItemSchema).nullish(),
  news: z.array(NewsArticleSchema).nullish(),
  competitorNews: z.array(NewsArticleSchema).nullish(),
  source: z.string().nullish(),
});
export type RadarResponse = z.infer<typeof RadarResponseSchema>;

export const ListenResponseSchema = z.object({
  ok: z.boolean(),
  scanned: z.number().nullish(),
  found: z.number().nullish(),
  inserted: z.number().nullish(),
  newsCount: z.number().nullish(),
  engines: z.array(z.string()).nullish(),
  questions: z.array(z.string()).nullish(),
  error: z.string().nullish(),
});
export type ListenResponse = z.infer<typeof ListenResponseSchema>;

export const SuggestPromptSchema = z.object({
  text: z.string(),
  ptype: z.string().nullish(),
  impact: z.union([z.number(), z.string()]).nullish(),
  reason: z.string().nullish(),
});

export const AdviseSuggestSchema = z.object({
  prompts: z.array(SuggestPromptSchema).nullish(),
  source: z.string().nullish(),
  error: z.string().nullish(),
});
export type AdviseSuggestResponse = z.infer<typeof AdviseSuggestSchema>;

export const AdviseTailorSchema = z.object({
  guidance: z.string().nullish(),
  source: z.string().nullish(),
  error: z.string().nullish(),
});
export type AdviseTailorResponse = z.infer<typeof AdviseTailorSchema>;

// geo-users (account administration)
export const AdminUserSchema = z.object({
  id: z.string(),
  email: z.string().nullish(),
  created_at: z.string().nullish(),
  last_sign_in_at: z.string().nullish(),
  email_confirmed: z.boolean().nullish(),
  role: z.string().nullish(),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

export const UsersResponseSchema = z.object({
  ok: z.boolean(),
  users: z.array(AdminUserSchema).nullish(),
  user: AdminUserSchema.nullish(),
  error: z.string().nullish(),
});
export type UsersResponse = z.infer<typeof UsersResponseSchema>;

// geo-classify-sources
export const ClassifySourcesSchema = z.object({
  ok: z.boolean(),
  sites: z
    .array(z.object({ domain: z.string(), kind: z.string(), label: z.string().nullish() }))
    .nullish(),
  error: z.string().nullish(),
  detail: z.string().nullish(),
});
