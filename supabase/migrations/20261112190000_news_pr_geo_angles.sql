-- Breaking-news radar 2026-11-12: each stored story now carries why the
-- system picked it. Written by the app from geo-news' reply; all optional, so
-- rows from older refreshes (headline only) still read fine.
alter table public.geo_news
  add column if not exists snippet text,     -- what the story says, ≤25 words
  add column if not exists pr_angle text,    -- why it matters for PR and how to use it
  add column if not exists geo_angle text,   -- why it matters for AI visibility (GEO)
  add column if not exists relevance smallint check (relevance between 1 and 5),
  add column if not exists found_by text,    -- google | ai | both
  add column if not exists angle text;       -- the search angle that found it
