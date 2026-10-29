-- Titles to target: the publications and sites the AI engines actually cite for
-- a client, each judged by geo-targets (a senior-PR review) for whether the
-- client could realistically earn coverage there with the story it has.
--
-- One row per client and title. A new review overwrites the AI columns and
-- moves batch_id on; the team's call (team_decision / team_note) is kept across
-- reviews and is fed back into the next one.

create table if not exists public.geo_target_titles (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.geo_brands(id) on delete cascade,
  -- Normalised domain (or lower-cased name when a title has no site).
  key text not null,
  domain text,
  name text not null,
  kind text,
  verdict text check (verdict in ('realistic', 'stretch', 'not_realistic')),
  priority int,
  route text,
  angle text,
  reason text,
  needs text,
  known boolean,
  -- Citation evidence behind the row.
  citations int not null default 0,
  gap_citations int not null default 0,
  engines text[] not null default '{}',
  questions int not null default 0,
  example_urls text[] not null default '{}',
  -- 'captured' = this client's measured answers; 'probe' = a first look from
  -- live AI searches before any answers were captured.
  basis text check (basis in ('captured', 'probe')),
  story text,
  batch_id uuid,
  team_decision text check (team_decision in ('relationship', 'no_go')),
  team_note text,
  updated_at timestamptz not null default now(),
  unique (brand_id, key)
);

alter table public.geo_target_titles enable row level security;
-- Same per-client access as the other geo_ tables.
drop policy if exists geo_target_titles_select on public.geo_target_titles;
create policy geo_target_titles_select on public.geo_target_titles
  for select to authenticated using (public.geo_can_see_brand(brand_id));
drop policy if exists geo_target_titles_write on public.geo_target_titles;
create policy geo_target_titles_write on public.geo_target_titles
  for all to authenticated
  using (public.geo_can_edit_brand(brand_id))
  with check (public.geo_can_edit_brand(brand_id));
