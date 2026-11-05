-- Stop a monthly check part-way (clicked by mistake, or something needs
-- changing first). Queued jobs are cancelled at once; jobs already sent finish
-- their API call but geo-measure sees the cancellation and doesn't save.
-- Resume with geo_enqueue_run(rid, samples, true), which measures only the
-- question × engine pairs that have no answer yet.
alter table public.geo_measure_jobs drop constraint if exists geo_measure_jobs_status_check;
alter table public.geo_measure_jobs add constraint geo_measure_jobs_status_check
  check (status in ('pending', 'sent', 'done', 'skipped', 'failed', 'cancelled'));

create or replace function public.geo_cancel_run(rid uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if not public.geo_can_edit_run(rid) then
    raise exception 'Not allowed to change this check';
  end if;
  update geo_measure_jobs
     set status = 'cancelled',
         error = 'Stopped by ' || coalesce((select email from auth.users where id = auth.uid()), 'the team'),
         finished_at = now()
   where run_id = rid and status in ('pending', 'sent');
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.geo_cancel_run(uuid) from public, anon;
grant execute on function public.geo_cancel_run(uuid) to authenticated;
