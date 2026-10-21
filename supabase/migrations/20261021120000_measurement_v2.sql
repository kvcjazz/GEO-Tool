-- Measurement v2: alternative names for exact mention matching, and room to
-- keep the full AI answer and how it was produced. All additive and nullable
-- (or defaulted), so the v1 app and functions keep working unchanged.

alter table public.geo_brands
  add column if not exists aliases text[] not null default '{}';
comment on column public.geo_brands.aliases is
  'Other names the brand appears under in AI answers (matched as whole words, case-insensitive).';

alter table public.geo_competitors
  add column if not exists aliases text[] not null default '{}';
comment on column public.geo_competitors.aliases is
  'Other names the competitor appears under in AI answers.';

alter table public.geo_responses
  add column if not exists answer text,
  add column if not exists web_search boolean,
  add column if not exists method text,
  add column if not exists model text,
  add column if not exists raw jsonb;
comment on column public.geo_responses.answer is 'Full AI answer shown as evidence (v2).';
comment on column public.geo_responses.web_search is 'True when every sample was answered with live web search (v2).';
comment on column public.geo_responses.method is 'Measurement method that produced the row: null = v1 (geo-run), ''v2'' = geo-measure.';
comment on column public.geo_responses.model is 'Provider model id that answered (v2).';
comment on column public.geo_responses.raw is 'Per-sample detail: answer, citations, checks and ratings (v2).';
