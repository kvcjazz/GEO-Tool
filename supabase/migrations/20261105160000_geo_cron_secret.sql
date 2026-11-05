-- geo-listen used to accept anyone's request (verify_jwt off, no check), so
-- anyone with the public key could spend the AI credit. It now accepts a
-- signed-in user, or the monthly cron job carrying a secret kept in Vault.
-- The function checks the secret through geo_cron_secret_ok, which only the
-- service role can call.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'geo_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'geo_cron_secret',
      'Shared secret for pg_cron → GEO edge functions (x-geo-cron header)');
  end if;
end $$;

create or replace function public.geo_cron_secret_ok(s text)
returns boolean
language sql
stable
security definer
set search_path = public, vault
as $$
  select coalesce(
    (select decrypted_secret = s from vault.decrypted_secrets where name = 'geo_cron_secret'),
    false
  );
$$;

revoke all on function public.geo_cron_secret_ok(text) from public, anon, authenticated;
grant execute on function public.geo_cron_secret_ok(text) to service_role;

select cron.schedule(
  'geo-monthly-listen',
  '0 7 1 * *',
  $cmd$
select net.http_post(
  url:='https://ymnulfluxjgqacodzfxq.supabase.co/functions/v1/geo-listen',
  headers:=jsonb_build_object(
    'content-type','application/json',
    'apikey','sb_publishable_S7jFJLSLAZkl65DWTXEfBQ_e1Ndm30f',
    'x-geo-cron',(select decrypted_secret from vault.decrypted_secrets where name = 'geo_cron_secret')
  ),
  body:=jsonb_build_object('brand_id', b.id::text),
  timeout_milliseconds:=150000
) from geo_brands b where b.archived = false;
$cmd$
);
