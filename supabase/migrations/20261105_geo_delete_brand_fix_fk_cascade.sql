-- Applied to Supabase project ymnulfluxjgqacodzfxq on 2026-11-05
-- (migration name: geo_delete_brand_fix_fk_cascade).
--
-- Deleting a client failed with:
--   update or delete on table "geo_brands" violates foreign key constraint
--   "geo_media_targets_brand_id_fkey" on table "geo_media_targets"
-- geo_media_targets / geo_radar_items / geo_news referenced geo_brands without
-- ON DELETE CASCADE, and geo_delete_brand never cleared them.

alter table public.geo_media_targets drop constraint geo_media_targets_brand_id_fkey,
  add constraint geo_media_targets_brand_id_fkey foreign key (brand_id) references public.geo_brands(id) on delete cascade;
alter table public.geo_radar_items drop constraint geo_radar_items_brand_id_fkey,
  add constraint geo_radar_items_brand_id_fkey foreign key (brand_id) references public.geo_brands(id) on delete cascade;
alter table public.geo_news drop constraint geo_news_brand_id_fkey,
  add constraint geo_news_brand_id_fkey foreign key (brand_id) references public.geo_brands(id) on delete cascade;

create or replace function public.geo_delete_brand(bid uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.geo_is_admin() then
    raise exception 'Only admins can delete brands';
  end if;
  delete from geo_measure_jobs where run_id in (select id from geo_runs where brand_id=bid);
  delete from geo_responses where run_id in (select id from geo_runs where brand_id=bid);
  delete from geo_competitor_sov where run_id in (select id from geo_runs where brand_id=bid);
  delete from geo_runs where brand_id=bid;
  delete from geo_competitors where brand_id=bid;
  delete from geo_prompts where brand_id=bid;
  delete from geo_opportunities where brand_id=bid;
  delete from geo_pr_activity where brand_id=bid;
  delete from geo_mentions where brand_id=bid;
  delete from geo_context where brand_id=bid;
  delete from geo_media_targets where brand_id=bid;
  delete from geo_radar_items where brand_id=bid;
  delete from geo_news where brand_id=bid;
  delete from geo_target_titles where brand_id=bid;
  delete from geo_source_kinds where brand_id=bid;
  delete from geo_user_brands where brand_id=bid;
  delete from geo_brands where id=bid;
end;$function$;
