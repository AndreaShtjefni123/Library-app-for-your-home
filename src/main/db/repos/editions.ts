import type pg from 'pg'
import type {
  BookDetail,
  BookInput,
  BookPage,
  BookSummary,
  ListParams,
  Ownership,
  Shelf,
  SortKey
} from '../../../shared/books'
import { SHELF_READING } from '../../../shared/books'
import { splitIsbn } from '../../../shared/isbn'
import { sortName, sortTitle } from '../../../shared/sorting'

type Db = pg.Pool | pg.PoolClient

// ---------- Reading lists ----------

const PROGRESS_SQL = `coalesce(rs.progress_percent,
  CASE WHEN e.pages > 0 AND rs.current_page IS NOT NULL THEN least(100, rs.current_page * 100.0 / e.pages) END)`

const AUTHORS_SQL = `coalesce((
  SELECT array_agg(p.display_name ORDER BY ec.position)
  FROM edition_contributor ec JOIN person p ON p.id = ec.person_id
  WHERE ec.edition_id = e.id AND ec.role = 'author'), '{}')`

const AUTHOR_SORT_SQL = `(
  SELECT lower(p.sort_name) FROM edition_contributor ec JOIN person p ON p.id = ec.person_id
  WHERE ec.edition_id = e.id AND ec.role = 'author' ORDER BY ec.position LIMIT 1)`

// Whitelisted ORDER BY expressions: the screen sends a key, never raw SQL.
const ORDER_SQL: Record<SortKey, string> = {
  title: 'e.sort_title',
  author: AUTHOR_SORT_SQL,
  year: 'e.pub_year',
  pages: 'e.pages',
  format: 'e.format',
  added: 'e.created_at',
  progress: PROGRESS_SQL
}

function shelfWhere(shelf: Shelf | undefined): string {
  if (!shelf) return ''
  if (shelf === 'own') return `AND e.record_status = 'owned'`
  if (shelf === 'want-to-buy') return `AND e.record_status = 'wishlist'`
  return `AND rs.status = '${SHELF_READING[shelf]}'`
}

function orderBy(params: Pick<ListParams, 'sort' | 'dir' | 'shelf'>): string {
  // Partly read is always "most read first, then most recently read".
  if (params.shelf === 'partly-read' && params.sort === 'progress') {
    return `${PROGRESS_SQL} ${params.dir} NULLS LAST, rs.last_read_at DESC NULLS LAST, e.sort_title, e.id`
  }
  const dir = params.dir === 'desc' ? 'DESC' : 'ASC'
  return `${ORDER_SQL[params.sort]} ${dir} NULLS LAST, e.sort_title, e.id`
}

interface SummaryRow {
  id: string
  title: string
  subtitle: string | null
  authors: string[]
  pub_year: number | null
  pages: number | null
  format: BookSummary['format']
  record_status: Ownership | 'stub'
  reading_status: BookSummary['readingStatus']
  cover_path: string | null
  cover_version: string
  created_at: Date
  current_page: number | null
  progress: string | null
  last_read_at: Date | null
  paused_note: string | null
}

const SUMMARY_COLUMNS = `
  e.id, e.title, e.subtitle, ${AUTHORS_SQL} AS authors, e.pub_year, e.pages, e.format,
  e.record_status, rs.status AS reading_status, e.cover_path,
  (extract(epoch from e.updated_at) * 1000)::bigint::text AS cover_version, e.created_at,
  rs.current_page, ${PROGRESS_SQL} AS progress, rs.last_read_at, rs.paused_note`

function toSummary(r: SummaryRow): BookSummary {
  return {
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    authors: r.authors,
    pubYear: r.pub_year,
    pages: r.pages,
    format: r.format,
    ownership: r.record_status === 'stub' ? 'none' : r.record_status,
    readingStatus: r.reading_status,
    coverPath: r.cover_path,
    coverVersion: r.cover_version,
    createdAt: r.created_at.toISOString(),
    currentPage: r.current_page,
    progressPercent: r.progress === null ? null : Math.round(Number(r.progress) * 10) / 10,
    lastReadAt: r.last_read_at?.toISOString() ?? null,
    pausedNote: r.paused_note
  }
}

export async function listBooks(db: Db, params: ListParams): Promise<BookPage> {
  const sql = `
    SELECT ${SUMMARY_COLUMNS}, count(*) OVER () AS total
    FROM edition e LEFT JOIN reading_status rs ON rs.edition_id = e.id
    WHERE e.deleted_at IS NULL ${shelfWhere(params.shelf)}
    ORDER BY ${orderBy(params)}
    LIMIT $1 OFFSET $2`
  const r = await db.query<SummaryRow & { total: string }>(sql, [params.limit, params.offset])
  let total = r.rows.length ? Number(r.rows[0].total) : 0
  if (!r.rows.length && params.offset > 0) total = await countBooks(db, params.shelf)
  return { items: r.rows.map(toSummary), total }
}

export async function countBooks(db: Db, shelf?: Shelf): Promise<number> {
  const r = await db.query<{ n: string }>(
    `SELECT count(*) AS n FROM edition e LEFT JOIN reading_status rs ON rs.edition_id = e.id
     WHERE e.deleted_at IS NULL ${shelfWhere(shelf)}`
  )
  return Number(r.rows[0].n)
}

/** All ids in the current order, for the book page's previous/next arrows. */
export async function orderedIds(db: Db, params: Pick<ListParams, 'sort' | 'dir' | 'shelf'>): Promise<string[]> {
  const r = await db.query<{ id: string }>(
    `SELECT e.id FROM edition e LEFT JOIN reading_status rs ON rs.edition_id = e.id
     WHERE e.deleted_at IS NULL ${shelfWhere(params.shelf)} ORDER BY ${orderBy(params)}`
  )
  return r.rows.map((x) => x.id)
}

export async function getBook(db: Db, id: string): Promise<BookDetail | null> {
  const r = await db.query<
    SummaryRow & {
      sort_title: string
      isbn13: string | null
      isbn10: string | null
      publisher: string | null
      pub_date: string | null
      language: string | null
      description: string | null
      started_at: string | null
      finished_at: string | null
      rating: string | null
      review: string | null
      notes: string | null
      spine_colour: string | null
      reading_updated_at: Date | null
      suggest_snoozed_until: Date | null
      updated_at: Date
      contributors: { name: string; role: BookDetail['contributors'][number]['role'] }[]
      series: { name: string; number: string | null } | null
      genres: string[]
      tags: string[]
      copies: { id: string; accessionNo: string; status: string }[]
      rating_avg: string | null
      rating_count: number | null
      subjects: string[]
      first_published_year: number | null
      source_ids: { olWorkKey?: string; googleId?: string } | null
    }
  >(
    `SELECT ${SUMMARY_COLUMNS},
       e.sort_title, e.isbn13, e.isbn10, pub.name AS publisher, e.pub_date, e.language, e.description,
       to_char(rs.started_at, 'YYYY-MM-DD') AS started_at, to_char(rs.finished_at, 'YYYY-MM-DD') AS finished_at,
       e.rating, e.review, e.notes, e.spine_colour, rs.updated_at AS reading_updated_at, rs.suggest_snoozed_until, e.updated_at,
       coalesce((SELECT json_agg(json_build_object('name', p.display_name, 'role', ec.role) ORDER BY ec.position)
                 FROM edition_contributor ec JOIN person p ON p.id = ec.person_id WHERE ec.edition_id = e.id), '[]') AS contributors,
       (SELECT json_build_object('name', s.name, 'number', es.number)
          FROM edition_series es JOIN series s ON s.id = es.series_id WHERE es.edition_id = e.id LIMIT 1) AS series,
       coalesce((SELECT array_agg(g.name ORDER BY g.name) FROM edition_genre eg JOIN genre g ON g.id = eg.genre_id
                 WHERE eg.edition_id = e.id), '{}') AS genres,
       coalesce((SELECT array_agg(t.name ORDER BY t.name) FROM edition_tag et JOIN tag t ON t.id = et.tag_id
                 WHERE et.edition_id = e.id), '{}') AS tags,
       coalesce((SELECT json_agg(json_build_object('id', c.id, 'accessionNo', c.accession_no, 'status', c.status)
                   ORDER BY c.accession_no)
                 FROM copy c WHERE c.edition_id = e.id AND c.deleted_at IS NULL), '[]') AS copies,
       e.rating_avg, e.rating_count, e.first_published_year, e.source_ids,
       coalesce((SELECT array_agg(sj.name ORDER BY sj.name) FROM edition_subject esj JOIN subject sj ON sj.id = esj.subject_id
                 WHERE esj.edition_id = e.id), '{}') AS subjects
     FROM edition e
     LEFT JOIN reading_status rs ON rs.edition_id = e.id
     LEFT JOIN publisher pub ON pub.id = e.publisher_id
     WHERE e.id = $1 AND e.deleted_at IS NULL`,
    [id]
  )
  const row = r.rows[0]
  if (!row) return null
  return {
    ...toSummary(row),
    sortTitle: row.sort_title,
    contributors: row.contributors,
    isbn13: row.isbn13,
    isbn10: row.isbn10,
    publisher: row.publisher,
    pubDate: row.pub_date,
    language: row.language,
    description: row.description,
    series: row.series ? { name: row.series.name, number: row.series.number === null ? null : Number(row.series.number) } : null,
    genres: row.genres,
    tags: row.tags,
    copies: row.copies,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    rating: row.rating === null ? null : Number(row.rating),
    review: row.review,
    notes: row.notes,
    spineColour: row.spine_colour,
    readingUpdatedAt: row.reading_updated_at?.toISOString() ?? null,
    suggestSnoozedUntil: row.suggest_snoozed_until?.toISOString() ?? null,
    updatedAt: row.updated_at.toISOString(),
    ratingAvg: row.rating_avg === null ? null : Number(row.rating_avg),
    ratingCount: row.rating_count,
    subjects: row.subjects,
    firstPublishedYear: row.first_published_year,
    links: catalogLinks(row.source_ids)
  }
}

/** Web pages for the book on the online catalogues it came from. */
function catalogLinks(ids: { olWorkKey?: string; googleId?: string } | null): { label: string; url: string }[] {
  const links: { label: string; url: string }[] = []
  if (ids?.olWorkKey) links.push({ label: 'Open Library', url: `https://openlibrary.org/works/${encodeURIComponent(ids.olWorkKey)}` })
  if (ids?.googleId) links.push({ label: 'Google Books', url: `https://books.google.com/books?id=${encodeURIComponent(ids.googleId)}` })
  return links
}

// ---------- Writing ----------

/** Finds a row by case-insensitive name, creating it if needed. Used for people, publishers, series. */
async function findOrCreate(db: Db, table: 'publisher' | 'series', name: string): Promise<string> {
  const found = await db.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE lower(name) = lower($1) AND deleted_at IS NULL`,
    [name]
  )
  if (found.rows[0]) return found.rows[0].id
  const made = await db.query<{ id: string }>(`INSERT INTO ${table} (name) VALUES ($1) RETURNING id`, [name])
  return made.rows[0].id
}

async function findOrCreatePerson(db: Db, name: string): Promise<string> {
  const found = await db.query<{ id: string }>(
    'SELECT id FROM person WHERE lower(display_name) = lower($1) AND deleted_at IS NULL',
    [name]
  )
  if (found.rows[0]) return found.rows[0].id
  const made = await db.query<{ id: string }>(
    'INSERT INTO person (display_name, sort_name) VALUES ($1, $2) RETURNING id',
    [name, sortName(name)]
  )
  return made.rows[0].id
}

export function editionValues(input: BookInput): unknown[] {
  const isbn = input.isbn ? splitIsbn(input.isbn) : null
  const pubYear = input.pubDate ? Number(input.pubDate.slice(0, 4)) : null
  return [
    input.title.trim(),
    input.subtitle ?? null,
    sortTitle(input.title),
    isbn?.isbn13 ?? null,
    isbn?.isbn10 ?? null,
    input.pubDate ?? null,
    pubYear,
    input.format ?? null,
    input.pages ?? null,
    input.language ?? null,
    input.description ?? null,
    input.ownership
  ]
}

export async function writeLinks(db: Db, editionId: string, input: BookInput): Promise<void> {
  const publisherId = input.publisher ? await findOrCreate(db, 'publisher', input.publisher) : null
  await db.query('UPDATE edition SET publisher_id = $2 WHERE id = $1', [editionId, publisherId])

  await db.query('DELETE FROM edition_contributor WHERE edition_id = $1', [editionId])
  const seen = new Set<string>()
  for (const [position, c] of input.contributors.entries()) {
    const personId = await findOrCreatePerson(db, c.name)
    const key = `${personId}:${c.role}`
    if (seen.has(key)) continue
    seen.add(key)
    await db.query(
      'INSERT INTO edition_contributor (edition_id, person_id, role, position) VALUES ($1, $2, $3, $4)',
      [editionId, personId, c.role, position]
    )
  }

  await db.query('DELETE FROM edition_series WHERE edition_id = $1', [editionId])
  if (input.seriesName) {
    const seriesId = await findOrCreate(db, 'series', input.seriesName)
    await db.query('INSERT INTO edition_series (edition_id, series_id, number) VALUES ($1, $2, $3)', [
      editionId,
      seriesId,
      input.seriesNumber ?? null
    ])
  }
}

async function inTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export { inTransaction }

/** Inserts a book with its people, series, first copy and reading status (inside the caller's transaction). */
export async function insertBook(db: pg.PoolClient, input: BookInput): Promise<string> {
  const r = await db.query<{ id: string }>(
    `INSERT INTO edition (title, subtitle, sort_title, isbn13, isbn10, pub_date, pub_year, format, pages,
                          language, description, record_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    editionValues(input)
  )
  const id = r.rows[0].id
  await writeLinks(db, id, input)
  if (input.ownership === 'owned') await db.query('INSERT INTO copy (edition_id, format) VALUES ($1, $2)', [id, input.format ?? null])
  if (input.readingStatus) {
    await db.query(
      `INSERT INTO reading_status (edition_id, status, started_at, finished_at)
       VALUES ($1, $2, CASE WHEN $2 IN ('reading', 'partly_read') THEN current_date END,
                       CASE WHEN $2 = 'read' THEN current_date END)`,
      [id, input.readingStatus]
    )
  }
  return id
}

export async function createBook(pool: pg.Pool, input: BookInput): Promise<string> {
  return inTransaction(pool, (db) => insertBook(db, input))
}

/** Updates the book's details. Shelves and reading progress are changed separately (see shelves.ts). */
export async function updateBook(pool: pg.Pool, id: string, input: Omit<BookInput, 'ownership' | 'readingStatus'>): Promise<void> {
  await inTransaction(pool, async (db) => {
    const values = editionValues({ ...input, ownership: 'owned' }).slice(0, 11)
    const r = await db.query(
      `UPDATE edition SET title = $2, subtitle = $3, sort_title = $4, isbn13 = $5, isbn10 = $6, pub_date = $7,
         pub_year = $8, format = $9, pages = $10, language = $11, description = $12
       WHERE id = $1 AND deleted_at IS NULL`,
      [id, ...values]
    )
    if (r.rowCount === 0) throw new Error('That book no longer exists')
    await writeLinks(db, id, { ...input, ownership: 'owned' })
  })
}

/** Moves a book to the Trash (it can be restored). */
export async function deleteBook(db: Db, id: string): Promise<void> {
  await db.query('UPDATE edition SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [id])
}

export async function restoreBook(db: Db, id: string): Promise<void> {
  await db.query('UPDATE edition SET deleted_at = NULL WHERE id = $1', [id])
}

/** "Add another copy" from the duplicate warning: one more physical copy of an existing book. */
export async function addCopy(pool: pg.Pool, editionId: string): Promise<void> {
  await inTransaction(pool, async (db) => {
    await db.query(
      `INSERT INTO copy (edition_id, format) SELECT id, format FROM edition WHERE id = $1 AND deleted_at IS NULL`,
      [editionId]
    )
    await db.query(`UPDATE edition SET record_status = 'owned' WHERE id = $1`, [editionId])
  })
}
