import type pg from 'pg'
import type { CopyDetails, CopyPatch, ProgressEntry, Quote } from '../../../shared/books'
import { inTransaction } from './editions'

// "Make it yours": your copies, rating, review, notes, tags, quotes and reading progress.

// ---------- Copies ----------

interface CopyRow {
  id: string
  accession_no: string
  format: CopyDetails['format']
  condition: CopyDetails['condition']
  location_note: string | null
  acquired_date: string | null
  acquired_source: string | null
  price: string | null
  currency: string | null
  gift_from: string | null
  is_signed: boolean
  signed_by: string | null
  is_first_edition: boolean
  limited_number: string | null
  notes: string | null
}

const toCopy = (r: CopyRow): CopyDetails => ({
  id: r.id,
  accessionNo: r.accession_no,
  format: r.format,
  condition: r.condition,
  locationNote: r.location_note,
  acquiredDate: r.acquired_date,
  acquiredSource: r.acquired_source,
  price: r.price,
  currency: r.currency,
  giftFrom: r.gift_from,
  isSigned: r.is_signed,
  signedBy: r.signed_by,
  isFirstEdition: r.is_first_edition,
  limitedNumber: r.limited_number,
  notes: r.notes
})

const COPY_COLUMNS = `id, accession_no, format, condition, location_note, to_char(acquired_date, 'YYYY-MM-DD') AS acquired_date,
  acquired_source, price::text AS price, currency, gift_from, is_signed, signed_by, is_first_edition, limited_number, notes`

/** Your copies of a book (one is created when you own it). */
export async function listCopies(db: pg.Pool, editionId: string): Promise<CopyDetails[]> {
  const r = await db.query<CopyRow>(
    `SELECT ${COPY_COLUMNS} FROM copy WHERE edition_id = $1 AND deleted_at IS NULL ORDER BY accession_no`,
    [editionId]
  )
  return r.rows.map(toCopy)
}

// The form's field names → table columns. Only these can be changed.
const COPY_FIELDS: Record<keyof CopyPatch, string> = {
  format: 'format',
  condition: 'condition',
  locationNote: 'location_note',
  acquiredDate: 'acquired_date',
  acquiredSource: 'acquired_source',
  price: 'price',
  currency: 'currency',
  giftFrom: 'gift_from',
  isSigned: 'is_signed',
  signedBy: 'signed_by',
  isFirstEdition: 'is_first_edition',
  limitedNumber: 'limited_number',
  notes: 'notes'
}

export async function updateCopy(db: pg.Pool, id: string, patch: CopyPatch): Promise<CopyDetails> {
  const entries = Object.entries(patch).filter(([k]) => k in COPY_FIELDS) as [keyof CopyPatch, unknown][]
  if (entries.length) {
    const sets = entries.map(([k], i) => `${COPY_FIELDS[k]} = $${i + 2}`)
    await db.query(`UPDATE copy SET ${sets.join(', ')} WHERE id = $1 AND deleted_at IS NULL`, [id, ...entries.map(([, v]) => v)])
  }
  const r = await db.query<CopyRow>(`SELECT ${COPY_COLUMNS} FROM copy WHERE id = $1`, [id])
  if (!r.rows[0]) throw new Error('That copy no longer exists')
  return toCopy(r.rows[0])
}

/** Removes one copy (e.g. you gave a duplicate away). The book stays. */
export async function removeCopy(db: pg.Pool, id: string): Promise<void> {
  await db.query('UPDATE copy SET deleted_at = now() WHERE id = $1', [id])
}

// ---------- Rating, review, notes, dates, tags ----------

export async function setRating(db: pg.Pool, editionId: string, rating: number | null): Promise<void> {
  await db.query('UPDATE edition SET rating = $2 WHERE id = $1', [editionId, rating])
}

export async function setWriting(db: pg.Pool, editionId: string, field: 'review' | 'notes', text: string | null): Promise<void> {
  const column = field === 'review' ? 'review' : 'notes'
  await db.query(`UPDATE edition SET ${column} = $2 WHERE id = $1`, [editionId, text?.trim() ? text : null])
}

/** Started / finished dates (only for books with a reading status). */
export async function setReadingDates(db: pg.Pool, editionId: string, startedAt: string | null, finishedAt: string | null): Promise<void> {
  await db.query('UPDATE reading_status SET started_at = $2, finished_at = $3 WHERE edition_id = $1', [editionId, startedAt, finishedAt])
}

export async function setTags(pool: pg.Pool, editionId: string, names: string[]): Promise<void> {
  // The first spelling typed wins ("Fantasy" then "fantasy" keeps "Fantasy").
  const seen = new Set<string>()
  const clean = names
    .map((n) => n.trim())
    .filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()))
    .slice(0, 30)
  await inTransaction(pool, async (db) => {
    await db.query('DELETE FROM edition_tag WHERE edition_id = $1', [editionId])
    for (const name of clean) {
      const found = await db.query<{ id: string }>('SELECT id FROM tag WHERE lower(name) = lower($1) AND deleted_at IS NULL', [name])
      const id = found.rows[0]?.id ?? (await db.query<{ id: string }>('INSERT INTO tag (name) VALUES ($1) RETURNING id', [name])).rows[0].id
      await db.query('INSERT INTO edition_tag (edition_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [editionId, id])
    }
  })
}

/** Tags already used, most used first, for suggestions while typing. */
export async function allTags(db: pg.Pool): Promise<string[]> {
  const r = await db.query<{ name: string }>(
    `SELECT t.name FROM tag t LEFT JOIN edition_tag et ON et.tag_id = t.id
     WHERE t.deleted_at IS NULL GROUP BY t.id ORDER BY count(et.edition_id) DESC, lower(t.name) LIMIT 200`
  )
  return r.rows.map((x) => x.name)
}

// ---------- Quotes ----------

export async function listQuotes(db: pg.Pool, editionId: string): Promise<Quote[]> {
  const r = await db.query<Quote>(
    'SELECT id, text, page, comment FROM quote WHERE edition_id = $1 ORDER BY sort_order, created_at',
    [editionId]
  )
  return r.rows
}

export async function saveQuote(db: pg.Pool, editionId: string, q: { id?: string; text: string; page: number | null; comment: string | null }): Promise<void> {
  if (q.id) {
    await db.query('UPDATE quote SET text = $3, page = $4, comment = $5 WHERE id = $1 AND edition_id = $2', [q.id, editionId, q.text, q.page, q.comment])
  } else {
    await db.query(
      `INSERT INTO quote (edition_id, text, page, comment, sort_order)
       VALUES ($1, $2, $3, $4, (SELECT coalesce(max(sort_order), 0) + 1 FROM quote WHERE edition_id = $1))`,
      [editionId, q.text, q.page, q.comment]
    )
  }
}

export async function deleteQuote(db: pg.Pool, id: string): Promise<void> {
  await db.query('DELETE FROM quote WHERE id = $1', [id])
}

/** Puts the quotes in the given order. */
export async function orderQuotes(pool: pg.Pool, editionId: string, ids: string[]): Promise<void> {
  await inTransaction(pool, async (db) => {
    for (const [i, id] of ids.entries()) await db.query('UPDATE quote SET sort_order = $3 WHERE id = $1 AND edition_id = $2', [id, editionId, i])
  })
}

// ---------- Reading progress ----------

/**
 * Notes how far you've got (a page, or a % when the page count isn't known). A book that wasn't
 * on a reading shelf moves to Currently reading. Returns the % reached, if it can be worked out.
 */
export async function logProgress(pool: pg.Pool, editionId: string, page: number | null, percent: number | null): Promise<number | null> {
  return inTransaction(pool, async (db) => {
    const book = await db.query<{ pages: number | null }>('SELECT pages FROM edition WHERE id = $1', [editionId])
    const pages = book.rows[0]?.pages ?? null
    const pct = page !== null && pages ? Math.min(100, Math.round((page / pages) * 1000) / 10) : percent
    await db.query('INSERT INTO progress_entry (edition_id, page, percent) VALUES ($1, $2, $3)', [editionId, page, pct])
    await db.query(
      `INSERT INTO reading_status AS rs (edition_id, status, started_at, current_page, progress_percent, last_read_at)
       VALUES ($1, 'reading', current_date, $2, $3, now())
       ON CONFLICT (edition_id) DO UPDATE SET
         status = CASE WHEN rs.status IN ('reading', 'partly_read') THEN rs.status ELSE 'reading' END,
         started_at = coalesce(rs.started_at, current_date),
         current_page = $2, progress_percent = CASE WHEN $2::int IS NULL THEN $3 ELSE NULL END,
         last_read_at = now(), suggest_snoozed_until = NULL`,
      [editionId, page, pct]
    )
    return pct
  })
}

export async function listProgress(db: pg.Pool, editionId: string): Promise<ProgressEntry[]> {
  const r = await db.query<{ id: string; page: number | null; percent: string | null; logged_at: Date }>(
    'SELECT id, page, percent, logged_at FROM progress_entry WHERE edition_id = $1 ORDER BY logged_at DESC LIMIT 200',
    [editionId]
  )
  return r.rows.map((x) => ({ id: x.id, page: x.page, percent: x.percent === null ? null : Number(x.percent), loggedAt: x.logged_at.toISOString() }))
}

export async function deleteProgress(db: pg.Pool, id: string): Promise<void> {
  await db.query('DELETE FROM progress_entry WHERE id = $1', [id])
}

// ---------- "Haven't read this in a while?" ----------

/** Puts off the suggestion for this book (days), or turns it off (null = never ask again). */
export async function snoozeSuggestion(db: pg.Pool, editionId: string, days: number | null): Promise<void> {
  await db.query(
    `UPDATE reading_status SET suggest_snoozed_until = CASE WHEN $2::int IS NULL THEN '9999-01-01'::timestamptz ELSE now() + make_interval(days => $2) END
     WHERE edition_id = $1`,
    [editionId, days]
  )
}
