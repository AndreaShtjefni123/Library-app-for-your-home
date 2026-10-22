-- 0002: the catalogue. An "edition" is the book itself; a "copy" is the physical item on your shelf.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------- People, publishers, series, genres, tags, subjects ----------

CREATE TABLE person (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  sort_name    text NOT NULL,
  bio          text,
  birth_date   text,
  death_date   text,
  photo_path   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE UNIQUE INDEX person_name_uq ON person (lower(display_name)) WHERE deleted_at IS NULL;
CREATE INDEX person_name_trgm ON person USING gin (lower(display_name) gin_trgm_ops);

CREATE TABLE publisher (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX publisher_name_uq ON publisher (lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE series (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX series_name_uq ON series (lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE genre (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  parent_id  uuid REFERENCES genre (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX genre_name_uq ON genre (lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE tag (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX tag_name_uq ON tag (lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE subject (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX subject_name_uq ON subject (lower(name));

-- ---------- Editions (the books) ----------

CREATE TABLE edition (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                text NOT NULL CHECK (btrim(title) <> ''),
  subtitle             text,
  sort_title           text NOT NULL,
  isbn13               text CHECK (isbn13 ~ '^97[89][0-9]{10}$'),
  isbn10               text CHECK (isbn10 ~ '^[0-9]{9}[0-9X]$'),
  publisher_id         uuid REFERENCES publisher (id),
  pub_date             text,
  pub_year             integer,
  first_published_year integer,
  edition_statement    text,
  format               text CHECK (format IN ('hardcover', 'paperback', 'ebook', 'audiobook', 'other')),
  pages                integer CHECK (pages > 0),
  language             text,
  description          text,
  cover_path           text,
  spine_colour         text,
  -- owned = on your shelves; wishlist = want to buy; none = neither (e.g. a library book you're reading)
  record_status        text NOT NULL DEFAULT 'owned' CHECK (record_status IN ('owned', 'wishlist', 'none', 'stub')),
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE UNIQUE INDEX edition_isbn13_uq ON edition (isbn13) WHERE deleted_at IS NULL AND isbn13 IS NOT NULL;
CREATE INDEX edition_sort_title ON edition (sort_title) WHERE deleted_at IS NULL;
CREATE INDEX edition_created ON edition (created_at) WHERE deleted_at IS NULL;
CREATE INDEX edition_title_trgm ON edition USING gin (lower(title) gin_trgm_ops);

CREATE TABLE edition_contributor (
  edition_id uuid NOT NULL REFERENCES edition (id) ON DELETE CASCADE,
  person_id  uuid NOT NULL REFERENCES person (id),
  role       text NOT NULL DEFAULT 'author'
             CHECK (role IN ('author', 'editor', 'translator', 'illustrator', 'narrator', 'foreword', 'contributor')),
  position   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (edition_id, person_id, role)
);
CREATE INDEX edition_contributor_person ON edition_contributor (person_id);

CREATE TABLE edition_series (
  edition_id uuid NOT NULL REFERENCES edition (id) ON DELETE CASCADE,
  series_id  uuid NOT NULL REFERENCES series (id),
  number     numeric(6, 2),
  PRIMARY KEY (edition_id, series_id)
);

CREATE TABLE edition_genre (
  edition_id uuid NOT NULL REFERENCES edition (id) ON DELETE CASCADE,
  genre_id   uuid NOT NULL REFERENCES genre (id),
  PRIMARY KEY (edition_id, genre_id)
);

CREATE TABLE edition_tag (
  edition_id uuid NOT NULL REFERENCES edition (id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES tag (id),
  PRIMARY KEY (edition_id, tag_id)
);

CREATE TABLE edition_subject (
  edition_id uuid NOT NULL REFERENCES edition (id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subject (id),
  PRIMARY KEY (edition_id, subject_id)
);

-- ---------- Where books live, and your physical copies ----------

CREATE TABLE location (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  parent_id  uuid REFERENCES location (id),
  kind       text NOT NULL DEFAULT 'shelf' CHECK (kind IN ('room', 'bookcase', 'shelf', 'box', 'other')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE SEQUENCE copy_accession_seq;

CREATE TABLE copy (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id      uuid NOT NULL REFERENCES edition (id) ON DELETE CASCADE,
  -- Your own running number for each physical book, like a real library's accession register.
  accession_no    text NOT NULL UNIQUE DEFAULT 'AL-' || lpad(nextval('copy_accession_seq')::text, 6, '0'),
  location_id     uuid REFERENCES location (id),
  status          text NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available', 'on_loan', 'lost', 'in_repair', 'given_away', 'sold', 'withdrawn')),
  format          text CHECK (format IN ('hardcover', 'paperback', 'ebook', 'audiobook', 'other')),
  condition       text,
  acquired_date   date,
  acquired_source text,
  price           numeric(10, 2),
  currency        text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
ALTER SEQUENCE copy_accession_seq OWNED BY copy.accession_no;
CREATE INDEX copy_edition ON copy (edition_id) WHERE deleted_at IS NULL;

-- ---------- Your reading ----------

CREATE TABLE reading_status (
  edition_id       uuid PRIMARY KEY REFERENCES edition (id) ON DELETE CASCADE,
  -- want = To-read pile; partly_read = read some/most of it, plan to come back; dnf = gave up on purpose
  status           text NOT NULL CHECK (status IN ('want', 'reading', 'partly_read', 'read', 'dnf')),
  started_at       date,
  finished_at      date,
  current_page     integer CHECK (current_page >= 0),
  progress_percent numeric(5, 2) CHECK (progress_percent BETWEEN 0 AND 100),
  last_read_at     timestamptz,
  paused_at        timestamptz,
  paused_note      text,
  rating           numeric(2, 1) CHECK (rating BETWEEN 0 AND 5 AND rating * 2 = round(rating * 2)),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reading_status_status ON reading_status (status);

-- ---------- Keep updated_at current everywhere ----------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['person', 'publisher', 'series', 'genre', 'tag', 'subject', 'edition', 'location', 'copy', 'reading_status']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t || '_updated_at', t);
  END LOOP;
END $$;
