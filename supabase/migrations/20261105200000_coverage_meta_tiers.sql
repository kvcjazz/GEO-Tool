-- Coverage details read from each article's page, and per-client outlet tiers.
--  * headline: the article's own headline (the spreadsheet "Title" column, or
--    the page's og:title / <title>), kept apart from the outlet name.
--  * geo_outlet_tiers: how this client rates a publication. One client's
--    Tier 1 can be another's Tier 2, so it is per client, keyed by site.
alter table public.geo_pr_activity add column if not exists headline text;

create table if not exists public.geo_outlet_tiers (
  brand_id uuid not null references public.geo_brands(id) on delete cascade,
  domain text not null,
  tier text not null check (tier in ('Tier 1', 'Tier 2', 'Tier 3')),
  updated_at timestamptz not null default now(),
  primary key (brand_id, domain)
);

alter table public.geo_outlet_tiers enable row level security;
drop policy if exists geo_outlet_tiers_select on public.geo_outlet_tiers;
create policy geo_outlet_tiers_select on public.geo_outlet_tiers
  for select to authenticated using (public.geo_can_see_brand(brand_id));
drop policy if exists geo_outlet_tiers_write on public.geo_outlet_tiers;
create policy geo_outlet_tiers_write on public.geo_outlet_tiers
  for all to authenticated
  using (public.geo_can_edit_brand(brand_id))
  with check (public.geo_can_edit_brand(brand_id));
