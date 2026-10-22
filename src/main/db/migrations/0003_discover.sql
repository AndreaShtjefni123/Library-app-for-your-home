-- 0003: details brought in from Open Library / Google Books, and a cache of their answers.

ALTER TABLE edition
  ADD COLUMN rating_avg   numeric(3, 2) CHECK (rating_avg BETWEEN 0 AND 5),
  ADD COLUMN rating_count integer CHECK (rating_count >= 0),
  -- Where the book came from (Open Library work/edition, Google volume), to refresh it later.
  ADD COLUMN source_ids   jsonb,
  -- The catalogues' original answers, kept so more details can be read later without going online.
  ADD COLUMN catalog_raw  jsonb;

CREATE INDEX edition_isbn10 ON edition (isbn10) WHERE deleted_at IS NULL AND isbn10 IS NOT NULL;

CREATE TABLE metadata_cache (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
