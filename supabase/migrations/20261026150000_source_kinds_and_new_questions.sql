-- What each cited site is, from a client's point of view, so "Where to earn
-- coverage" can leave out competitors (a PR agency won't be covered on another
-- agency's blog). Classified once per client by geo-classify-sources; the team
-- can override a call ("source" = 'team').

create table if not exists public.geo_source_kinds (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.geo_brands(id) on delete cascade,
  domain text not null,
  kind text not null
    check (kind in ('competitor', 'media', 'directory', 'review', 'community', 'academic', 'other')),
  label text,
  source text not null default 'ai' check (source in ('ai', 'team')),
  updated_at timestamptz not null default now(),
  unique (brand_id, domain)
);

alter table public.geo_source_kinds enable row level security;
drop policy if exists geo_source_kinds_all on public.geo_source_kinds;
create policy geo_source_kinds_all on public.geo_source_kinds
  for all to authenticated using (true) with check (true);

-- Re-measuring can now be limited to question × engine pairs the run has no
-- answer for yet — used after adding questions mid-month.
drop function if exists public.geo_enqueue_run(uuid, int);
create or replace function public.geo_enqueue_run(
  rid uuid,
  p_samples int default 3,
  p_only_new boolean default false
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update geo_runs set method = 'v2' where id = rid;
  insert into geo_measure_jobs (run_id, prompt_id, engine, samples)
  select rid, p.id, e.engine, greatest(1, least(5, coalesce(p_samples, 3)))
  from geo_runs r
  join geo_prompts p on p.brand_id = r.brand_id and p.active
  cross join unnest(array['ChatGPT', 'Google AI / Gemini', 'Perplexity', 'Copilot', 'Claude', 'Grok']) as e(engine)
  where r.id = rid
    and not exists (
      select 1 from geo_measure_jobs j
      where j.run_id = rid and j.prompt_id = p.id and j.engine = e.engine
        and j.status in ('pending', 'sent')
    )
    and not (
      p_only_new and exists (
        select 1 from geo_responses x
        where x.run_id = rid and x.prompt_id = p.id and x.engine = e.engine
      )
    );
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.geo_enqueue_run(uuid, int, boolean) from public, anon;
grant execute on function public.geo_enqueue_run(uuid, int, boolean) to authenticated;
