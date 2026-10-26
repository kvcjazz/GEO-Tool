-- Measurement v2 switch-over: snapshots and Auto-run go through a job queue.
--
-- Why a queue: geo-run-batch measured every prompt inside one edge-function
-- call and was cut off by the time limit after ~7 prompts, so monthly
-- snapshots were silently incomplete. Now each prompt × engine is its own job;
-- a once-a-minute dispatcher keeps a bounded number in flight and geo-measure
-- saves each result itself.

alter table public.geo_runs add column if not exists method text;
comment on column public.geo_runs.method is
  'Measurement method of the run: null = v1 (geo-run), ''v2'' = geo-measure. Trend lines only compare runs of the same method.';

create table if not exists public.geo_measure_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.geo_runs(id) on delete cascade,
  prompt_id uuid not null references public.geo_prompts(id) on delete cascade,
  engine text not null,
  samples int not null default 3 check (samples between 1 and 5),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'done', 'skipped', 'failed')),
  attempts int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  finished_at timestamptz
);
create index if not exists geo_measure_jobs_status_idx on public.geo_measure_jobs (status, created_at);
create index if not exists geo_measure_jobs_run_idx on public.geo_measure_jobs (run_id);

alter table public.geo_measure_jobs enable row level security;
drop policy if exists geo_measure_jobs_read on public.geo_measure_jobs;
create policy geo_measure_jobs_read on public.geo_measure_jobs
  for select to authenticated using (true);
-- No write policies: jobs are created by the functions below and updated by
-- geo-measure with the service role.

-- Queue a v2 measurement of every active prompt × engine for a run. Engines
-- without an API key come back "skipped" almost instantly. Prompt × engine
-- pairs already queued or in flight are not queued twice.
create or replace function public.geo_enqueue_run(rid uuid, p_samples int default 3)
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
    );
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Start a fresh monthly v2 run for a brand and queue all its measurements.
create or replace function public.geo_start_snapshot(bid uuid, p_samples int default 3)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
begin
  update geo_runs set is_current = false where brand_id = bid and is_current;
  insert into geo_runs (brand_id, label, run_date, is_current, method)
  values (bid, to_char(now(), 'YYYY-MM') || ' (Current)', current_date, true, 'v2')
  returning id into rid;
  perform geo_enqueue_run(rid, p_samples);
  return rid;
end;
$$;

-- Called every minute by pg_cron. Re-queues jobs stuck in flight (the edge
-- call died), then sends pending jobs to geo-measure until max_in_flight are
-- in flight. Returns how many it sent.
create or replace function public.geo_dispatch_measure_jobs(max_in_flight int default 12)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  free int;
  sent int := 0;
  j record;
begin
  update geo_measure_jobs
     set status = case when attempts >= 2 then 'failed' else 'pending' end,
         error = case when attempts >= 2 then coalesce(error, 'no result after 2 attempts') else error end,
         finished_at = case when attempts >= 2 then now() else null end
   where status = 'sent' and sent_at < now() - interval '6 minutes';

  select max_in_flight - count(*) into free from geo_measure_jobs where status = 'sent';
  if free <= 0 then
    return 0;
  end if;

  for j in
    select id from geo_measure_jobs
     where status = 'pending'
     order by created_at
     limit free
     for update skip locked
  loop
    update geo_measure_jobs
       set status = 'sent', attempts = attempts + 1, sent_at = now()
     where id = j.id;
    perform net.http_post(
      url := 'https://ymnulfluxjgqacodzfxq.supabase.co/functions/v1/geo-measure',
      -- geo-measure keeps verify_jwt on, so send the project's (public) legacy
      -- anon JWT, as the other GEO cron jobs send their public key.
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltbnVsZmx1eGpncWFjb2R6ZnhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NjI4OTksImV4cCI6MjA5MDUzODg5OX0.MrQSMTrkXGLQiZJpAFN6QLkzBLbFyHzmzIZGIddC8Ts',
        'authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltbnVsZmx1eGpncWFjb2R6ZnhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NjI4OTksImV4cCI6MjA5MDUzODg5OX0.MrQSMTrkXGLQiZJpAFN6QLkzBLbFyHzmzIZGIddC8Ts'
      ),
      body := jsonb_build_object('job_id', j.id),
      timeout_milliseconds := 300000
    );
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

-- Supabase grants new functions to anon by default; these are for signed-in
-- users (snapshot / Auto-run) and for cron (dispatch) only.
revoke all on function public.geo_enqueue_run(uuid, int) from public, anon;
revoke all on function public.geo_start_snapshot(uuid, int) from public, anon;
revoke all on function public.geo_dispatch_measure_jobs(int) from public, anon, authenticated;
grant execute on function public.geo_enqueue_run(uuid, int) to authenticated;
grant execute on function public.geo_start_snapshot(uuid, int) to authenticated;

-- Schedules: the monthly snapshot starts a v2 run per active brand (replacing
-- the geo-run-batch call), and the dispatcher drains the queue every minute.
select cron.schedule(
  'geo-monthly-snapshot',
  '0 6 1 * *',
  $$select public.geo_start_snapshot(b.id, 3) from public.geo_brands b where b.archived = false;$$
);
select cron.schedule(
  'geo-measure-dispatch',
  '* * * * *',
  $$select public.geo_dispatch_measure_jobs(12);$$
);
