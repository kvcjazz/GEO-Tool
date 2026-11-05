-- Share of voice v2: every brand an AI answer names, not just the tracked
-- competitors. Filled per answer by geo-measure (new checks) and geo-entities
-- (backfill). Shape:
--   { "v": 1, "branded": <question names the client>, "model": "...",
--     "samples": [ [ { "name": "State Farm", "recommended": true, "client": false }, ... ], ... ] }
-- Brands are listed in order of first appearance in each sample's answer.
alter table public.geo_responses add column if not exists entities jsonb;
