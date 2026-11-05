-- "Copilot" was measured with the same OpenAI model as ChatGPT (Microsoft
-- Copilot has no public API), so it double-counted ChatGPT. Stop measuring it,
-- fold its weight into ChatGPT, and drop any queued Copilot jobs. Its past
-- answers stay in geo_responses but the app ignores them.

update public.geo_brands
set engine_weights = (engine_weights - 'Copilot')
  || jsonb_build_object(
       'ChatGPT',
       coalesce((engine_weights ->> 'ChatGPT')::numeric, 0)
         + coalesce((engine_weights ->> 'Copilot')::numeric, 0)
     )
where engine_weights ? 'Copilot';

alter table public.geo_brands
  alter column engine_weights set default
  '{"ChatGPT":42,"Google AI / Gemini":22,"Perplexity":18,"Claude":10,"Grok":8}'::jsonb;

update public.geo_measure_jobs
set status = 'skipped', error = 'Copilot is no longer measured'
where engine = 'Copilot' and status in ('pending', 'sent');

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
  cross join unnest(array['ChatGPT', 'Google AI / Gemini', 'Perplexity', 'Claude', 'Grok']) as e(engine)
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
