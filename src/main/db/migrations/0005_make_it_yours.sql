-- 0005: "Make it yours": your copy's details, your rating and review, quotes, and a reading log.

-- Your verdict belongs to the book (not to one particular read).
ALTER TABLE edition
  ADD COLUMN rating numeric(2, 1) CHECK (rating BETWEEN 0.5 AND 5 AND rating * 2 = round(rating * 2)),
  ADD COLUMN review text;

UPDATE edition e SET rating = rs.rating
FROM reading_status rs
WHERE rs.edition_id = e.id AND rs.rating IS NOT NULL AND rs.rating >= 0.5;

-- Details of your physical copy.
ALTER TABLE copy
  ADD COLUMN location_note    text,       -- "Living room, shelf 3" (a proper location picker comes later)
  ADD COLUMN gift_from        text,
  ADD COLUMN is_signed        boolean NOT NULL DEFAULT false,
  ADD COLUMN signed_by        text,
  ADD COLUMN is_first_edition boolean NOT NULL DEFAULT false,
  ADD COLUMN limited_number   text;       -- e.g. "123/500"

-- "Haven't read this in a while?" can be put off or turned off per book.
ALTER TABLE reading_status ADD COLUMN suggest_snoozed_until timestamptz;

CREATE TABLE quote (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES edition (id) ON DELETE CASCADE,
  text       text NOT NULL CHECK (btrim(text) <> ''),
  page       integer CHECK (page >= 0),
  comment    text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quote_edition ON quote (edition_id, sort_order);
CREATE TRIGGER quote_updated_at BEFORE UPDATE ON quote FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every time you note how far you've got.
CREATE TABLE progress_entry (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES edition (id) ON DELETE CASCADE,
  page       integer CHECK (page >= 0),
  percent    numeric(5, 2) CHECK (percent BETWEEN 0 AND 100),
  logged_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (page IS NOT NULL OR percent IS NOT NULL)
);
CREATE INDEX progress_entry_edition ON progress_entry (edition_id, logged_at DESC);
