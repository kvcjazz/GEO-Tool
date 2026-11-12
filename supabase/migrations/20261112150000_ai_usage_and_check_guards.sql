-- AI spend: every paid model call is logged, and the monthly cron no longer
-- re-measures a client that was checked a few days earlier.
--
-- Why: nothing recorded what the edge functions spent, so duplicate checks
-- (a manual check days after the cron one, "Re-measure" over cells already
-- measured) went unnoticed while the Anthropic and OpenAI accounts hit their
-- limits.

-- ---- Usage log ---------------------------------------------------------------
-- One row per provider request (each model id tried, each retry), written by
-- the edge functions with the service role. Spend is admin-only information.
create table if not exists public.geo_ai_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  brand_id uuid references public.geo_brands(id) on delete set null,
  fn text not null,                 -- edge function, e.g. geo-measure
  purpose text not null,            -- e.g. answer, grade, entities, radar
  provider text not null,           -- anthropic | openai | gemini | perplexity | xai
  model text,
  ok boolean not null default true,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,   -- includes thinking/reasoning tokens
  searches integer not null default 0,        -- web searches the provider billed
  reported_cost_usd numeric,                  -- when the provider reports it (Perplexity)
  error text
);
create index if not exists geo_ai_usage_created_idx on public.geo_ai_usage (created_at);
create index if not exists geo_ai_usage_brand_idx on public.geo_ai_usage (brand_id, created_at);

alter table public.geo_ai_usage enable row level security;
drop policy if exists geo_ai_usage_select on public.geo_ai_usage;
create policy geo_ai_usage_select on public.geo_ai_usage
  for select to authenticated using (public.geo_is_admin());
-- No insert/update policy: only the service role (edge functions) writes.

-- ---- Price list --------------------------------------------------------------
-- Entered by an admin from the providers' price pages, so the spend panel can
-- turn tokens and searches into an estimate. A row matches a call when the
-- call's model starts with model_prefix (longest prefix wins; '' = any model
-- of that provider).
create table if not exists public.geo_ai_rates (
  provider text not null,
  model_prefix text not null default '',
  usd_per_m_input numeric not null default 0,
  usd_per_m_output numeric not null default 0,
  usd_per_search numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (provider, model_prefix)
);
alter table public.geo_ai_rates enable row level security;
drop policy if exists geo_ai_rates_admin on public.geo_ai_rates;
create policy geo_ai_rates_admin on public.geo_ai_rates
  for all to authenticated using (public.geo_is_admin()) with check (public.geo_is_admin());

-- ---- Monthly roll-up -----------------------------------------------------------
-- Usage grouped by month, client, function, purpose, provider and model, so the
-- panel never pulls thousands of raw rows.
create or replace function public.geo_ai_usage_summary(p_from date, p_to date)
returns table (
  month date,
  brand_id uuid,
  fn text,
  purpose text,
  provider text,
  model text,
  calls bigint,
  failed bigint,
  input_tokens bigint,
  output_tokens bigint,
  searches bigint,
  reported_cost_usd numeric
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    date_trunc('month', u.created_at)::date,
    u.brand_id, u.fn, u.purpose, u.provider, coalesce(u.model, ''),
    count(*),
    count(*) filter (where not u.ok),
    coalesce(sum(u.input_tokens), 0)::bigint,
    coalesce(sum(u.output_tokens), 0)::bigint,
    coalesce(sum(u.searches), 0)::bigint,
    sum(u.reported_cost_usd)
  from geo_ai_usage u
  where public.geo_is_admin()
    and u.created_at >= p_from
    and u.created_at < (p_to + 1)
  group by 1, 2, 3, 4, 5, 6;
$$;
revoke all on function public.geo_ai_usage_summary(date, date) from public, anon;
grant execute on function public.geo_ai_usage_summary(date, date) to authenticated;

-- ---- Monthly check without duplicates -------------------------------------------
-- The cron used to start a new check for every client on the 1st, even one the
-- team had fully measured a few days earlier (Hippo: 29 Oct, then 1 Nov). Now it
-- skips a client whose latest v2 check started within p_min_days.
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
    select g.id from geo_brands g
    where not g.archived
      and not exists (
        select 1 from geo_runs r
        where r.brand_id = g.id and r.method = 'v2'
          and r.created_at > now() - make_interval(days => p_min_days)
      )
  loop
    perform geo_start_snapshot(b.id, p_samples);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.geo_monthly_snapshots(integer, integer) from public, anon, authenticated;

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'geo-monthly-snapshot'),
  command := 'select public.geo_monthly_snapshots(3, 7);'
);
