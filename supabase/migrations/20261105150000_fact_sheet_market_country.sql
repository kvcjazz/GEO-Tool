-- Client fact sheet (the team's ground truth about the client, used by every
-- AI step and to judge whether AI answers are accurate) and the client's main
-- market as an ISO 3166-1 alpha-2 code, passed to the engines' web search so
-- answers reflect what buyers in that country see.
alter table public.geo_brands
  add column if not exists fact_sheet jsonb not null default '{}'::jsonb,
  add column if not exists market_country text
    check (market_country is null or market_country ~ '^[A-Z]{2}$');

-- Pre-fill the market from the free-text region where it is unambiguous.
update public.geo_brands
set market_country = case
  when pr_region ~* '^\s*(uk|united kingdom|great britain|gb|england|london)\y' then 'GB'
  when pr_region ~* '^\s*(us|usa|united states|north america)\y' then 'US'
  when pr_region ~* '^\s*(germany|dach)\y' then 'DE'
  when pr_region ~* '^\s*france\y' then 'FR'
  when pr_region ~* '^\s*ireland\y' then 'IE'
  when pr_region ~* '^\s*australia\y' then 'AU'
  when pr_region ~* '^\s*canada\y' then 'CA'
  else null
end
where market_country is null and pr_region is not null;
