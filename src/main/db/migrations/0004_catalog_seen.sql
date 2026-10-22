-- 0004: every book the app has seen in an online search, so suggestions can appear instantly
-- (from this PC) while Open Library is still answering, and even offline.

CREATE TABLE catalog_seen (
  key         text PRIMARY KEY,          -- Open Library work key, or Google volume id
  result      jsonb NOT NULL,            -- the search result as shown (title, authors, cover, year…)
  search_text text NOT NULL,             -- title + authors, lower-case without accents, for matching
  seen_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX catalog_seen_text_trgm ON catalog_seen USING gin (search_text gin_trgm_ops);
