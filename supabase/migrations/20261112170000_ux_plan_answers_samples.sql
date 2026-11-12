-- UX round 2026-11-12: per-client samples, action-plan due dates, an audit
-- trail for manual overrides, and question versions.

-- Samples per question used to live only in the browser session (reset to 3
-- on every reload, never seen by the cron). It is now a client setting used by
-- manual checks and the automatic monthly check alike.
alter table public.geo_brands
  add column if not exists measure_samples smallint not null default 3
  check (measure_samples between 1 and 5);

create or replace function public.geo_monthly_snapshots(p_samples integer default 3, p_min_days integer default 7)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  b record;
  n int := 0;
begin
  for b in
    select g.id, g.measure_samples from geo_brands g
    where not g.archived
      and not exists (
        select 1 from geo_runs r
        where r.brand_id = g.id and r.method = 'v2'
          and r.created_at > now() - make_interval(days => p_min_days)
      )
  loop
    perform geo_start_snapshot(b.id, coalesce(b.measure_samples, p_samples));
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.geo_monthly_snapshots(integer, integer) from public, anon, authenticated;

-- Action plan: when each action is due (owner already exists).
alter table public.geo_opportunities add column if not exists due_date date;

-- Manual overrides of an AI rating: who changed it, when, and what the
-- measurement said before, so the score and the client report can show it.
--   { "by": "a@b.com", "at": "2026-11-12T10:00:00Z",
--     "original": { "prominence": "Passing", ... } }
alter table public.geo_responses add column if not exists override jsonb;

-- Rewording a question that already has answers creates a new question; the
-- new one points at the one it replaces so history can be followed.
alter table public.geo_prompts
  add column if not exists replaces uuid references public.geo_prompts(id) on delete set null;
