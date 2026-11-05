-- Search demand (SEO input) — phase 1.
--
-- SEO data (Google Search Console / keyword-tool exports) is used only as an
-- INPUT for choosing which questions to ask the AI engines. It is never part
-- of the GEO score. Everything SEO-derived is kept in clearly named columns so
-- the app can always label it as SEO, separate from GEO measurement.
--
-- 1. geo_search_terms: one row per client and search term the team imported.
--    `query` is stored normalised (lower-case, single spaces).
--    `volume` = monthly searches (keyword tools); `impressions` / `clicks` /
--    `position` = the client's own Google Search Console figures.
-- 2. geo_prompts.seo_*: a tracked question that was drafted from a search term
--    remembers which term and how much demand it had when it was added.

create table if not exists public.geo_search_terms (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.geo_brands(id) on delete cascade,
  query text not null,
  volume int,
  impressions int,
  clicks int,
  position numeric,
  source text,
  imported_at timestamptz not null default now(),
  unique (brand_id, query)
);

alter table public.geo_search_terms enable row level security;
-- Same per-client access as the other geo_ tables.
drop policy if exists geo_search_terms_select on public.geo_search_terms;
create policy geo_search_terms_select on public.geo_search_terms
  for select to authenticated using (public.geo_can_see_brand(brand_id));
drop policy if exists geo_search_terms_write on public.geo_search_terms;
create policy geo_search_terms_write on public.geo_search_terms
  for all to authenticated
  using (public.geo_can_edit_brand(brand_id))
  with check (public.geo_can_edit_brand(brand_id));

alter table public.geo_prompts
  add column if not exists seo_seed text,
  add column if not exists seo_demand int,
  add column if not exists seo_demand_kind text
    check (seo_demand_kind in ('volume', 'impressions'));

comment on column public.geo_prompts.seo_seed is
  'SEO input: the Google search term this question was drafted from (null = not from search data).';
comment on column public.geo_prompts.seo_demand is
  'SEO input: demand for seo_seed when the question was added (see seo_demand_kind).';
comment on column public.geo_prompts.seo_demand_kind is
  'volume = monthly searches from a keyword tool; impressions = Search Console impressions.';
