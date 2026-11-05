-- The short visibility-strategy summary shown on the Overview. It is written by
-- the AI (geo-advise, mode "summary") from the strategy and PR profile in
-- Client setup, and the team can edit it.
--
--   strategy_summary         headline on the first line, then "- " bullet lines
--   strategy_summary_source  fingerprint of the Client setup fields it was
--                            written from; when they change, an AI summary is
--                            rewritten and an edited one is flagged as out of date
--   strategy_summary_edited  true once the team has edited it, so the AI never
--                            overwrites their wording without being asked
alter table public.geo_brands
  add column if not exists strategy_summary text,
  add column if not exists strategy_summary_source text,
  add column if not exists strategy_summary_edited boolean not null default false;
