-- Lightweight read of every v2 answer for a client, with the citation URLs
-- pulled out of `raw` (one list per sample), so the PR impact view can match
-- an article URL exactly without downloading full answers. Runs as the caller,
-- so the usual geo_ row-level security applies.
create or replace function public.geo_v2_answers(bid uuid)
returns table (
  run_id uuid,
  run_date date,
  run_created timestamptz,
  prompt_id uuid,
  engine text,
  mentioned boolean,
  cited_sources text,
  urls text[]
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    x.run_id,
    r.run_date,
    r.created_at,
    x.prompt_id,
    x.engine,
    x.mentioned,
    x.cited_sources,
    coalesce((
      select array_agg(distinct u)
      from jsonb_array_elements(case when jsonb_typeof(x.raw) = 'array' then x.raw else '[]'::jsonb end) s,
           jsonb_array_elements_text(
             case when jsonb_typeof(s -> 'citations') = 'array' then s -> 'citations' else '[]'::jsonb end
           ) u
    ), '{}')
  from geo_responses x
  join geo_runs r on r.id = x.run_id
  where r.brand_id = bid and r.method = 'v2' and x.engine <> 'Copilot';
$$;

revoke all on function public.geo_v2_answers(uuid) from public, anon;
grant execute on function public.geo_v2_answers(uuid) to authenticated;
