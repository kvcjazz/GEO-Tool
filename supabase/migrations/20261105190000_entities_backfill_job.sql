-- Keeps geo_responses.entities filled: every 2 minutes, for each client with
-- measurement-v2 answers still unread, call geo-entities (one pass of ~70 s).
-- Does nothing once everything is read, so it also catches answers whose
-- extraction failed during a check.
select cron.schedule(
  'geo-entities-backfill',
  '*/2 * * * *',
  $cmd$
select net.http_post(
  url:='https://ymnulfluxjgqacodzfxq.supabase.co/functions/v1/geo-entities',
  headers:=jsonb_build_object(
    'content-type','application/json',
    'apikey','sb_publishable_S7jFJLSLAZkl65DWTXEfBQ_e1Ndm30f',
    'x-geo-cron',(select decrypted_secret from vault.decrypted_secrets where name = 'geo_cron_secret')
  ),
  body:=jsonb_build_object('brand_id', b.id::text),
  timeout_milliseconds:=150000
) from geo_brands b
where not b.archived
  and exists (
    select 1 from geo_responses x join geo_runs r on r.id = x.run_id
    where r.brand_id = b.id and r.method = 'v2' and x.entities is null and x.engine <> 'Copilot'
      and x.answer is not null
  );
$cmd$
);
