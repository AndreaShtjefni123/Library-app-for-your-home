import type pg from 'pg'
import type { BookInput, Ownership, ReadingStatus } from '../../shared/books'
import type { AddResult, AddTarget, CatalogBook } from '../../shared/catalog'
import { inTransaction, insertBook } from '../db/repos/editions'
import { saveCover, storeBookCover } from './covers'
import type { ImageTools } from './imageTools'

/** What each shelf means. Every book is yours, except ones on Want to buy. */
export const TARGETS: Record<AddTarget, { ownership: Ownership; reading: ReadingStatus | null }> = {
  'to-read': { ownership: 'owned', reading: 'want' },
  'want-to-buy': { ownership: 'wishlist', reading: null },
  reading: { ownership: 'owned', reading: 'reading' },
  read: { ownership: 'owned', reading: 'read' }
}

export interface ImportDeps {
  coversDir: string
  fetchImage: (url: string) => Promise<{ bytes: Buffer }>
  /** The catalogues' original answers, stored with the book. */
  raw?: unknown
  /** Makes the small preview and finds the main colour (Electron's image tools in the app). */
  imageTools?: ImageTools
}

export function toBookInput(book: CatalogBook, target: AddTarget): BookInput {
  const { ownership, reading } = TARGETS[target]
  return {
    title: book.title.slice(0, 500),
    subtitle: book.subtitle?.slice(0, 500) || undefined,
    contributors: book.contributors.slice(0, 30).map((c) => ({ name: c.name.slice(0, 200), role: c.role })),
    publisher: book.publisher?.slice(0, 200) || undefined,
    pubDate: book.pubDate && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(book.pubDate) ? book.pubDate : undefined,
    pages: book.pages && book.pages > 0 && book.pages < 100_000 ? book.pages : undefined,
    isbn: book.isbn13 ?? book.isbn10 ?? undefined,
    format: book.format ?? undefined,
    language: book.language?.slice(0, 50) || undefined,
    description: book.description?.slice(0, 20_000) || undefined,
    seriesName: book.series?.name.slice(0, 200),
    seriesNumber: book.series?.number ?? undefined,
    ownership,
    readingStatus: reading
  }
}

async function linkNames(db: pg.PoolClient, editionId: string, table: 'subject' | 'genre', names: string[]): Promise<void> {
  for (const name of names) {
    const found = await db.query<{ id: string }>(`SELECT id FROM ${table} WHERE lower(name) = lower($1)`, [name])
    const id =
      found.rows[0]?.id ?? (await db.query<{ id: string }>(`INSERT INTO ${table} (name) VALUES ($1) RETURNING id`, [name])).rows[0].id
    await db.query(`INSERT INTO edition_${table} (edition_id, ${table}_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [editionId, id])
  }
}

/**
 * Saves a book found online, with every detail, onto the chosen shelf (pictures follow via
 * savePictures). If the same ISBN is already in the library, nothing is duplicated and the
 * existing book is returned.
 */
export async function addFromCatalog(pool: pg.Pool, book: CatalogBook, target: AddTarget, deps: ImportDeps): Promise<AddResult> {
  const input = toBookInput(book, target)

  if (book.isbn13) {
    const existing = await pool.query<{ id: string }>('SELECT id FROM edition WHERE isbn13 = $1 AND deleted_at IS NULL', [book.isbn13])
    if (existing.rows[0]) return { id: existing.rows[0].id, existed: true }
  }

  const id = await inTransaction(pool, async (db) => {
    const editionId = await insertBook(db, input)
    await db.query(
      `UPDATE edition SET first_published_year = $2, rating_avg = $3, rating_count = $4, source_ids = $5, catalog_raw = $6
       WHERE id = $1`,
      [
        editionId,
        book.firstPublishedYear,
        book.ratingAvg !== null ? Math.min(5, Math.max(0, book.ratingAvg)) : null,
        book.ratingCount,
        JSON.stringify(book.ref),
        deps.raw === undefined ? null : JSON.stringify(deps.raw)
      ]
    )
    const genreNames = new Set(book.genres.map((g) => g.toLowerCase()))
    await linkNames(db, editionId, 'subject', book.subjects.filter((s) => !genreNames.has(s.toLowerCase())).slice(0, 15))
    await linkNames(db, editionId, 'genre', book.genres.slice(0, 5))
    // Fill in what we know about each person, without overwriting anything already there.
    for (const person of book.contributors) {
      await db.query(
        `UPDATE person SET bio = coalesce(bio, $2), birth_date = coalesce(birth_date, $3), death_date = coalesce(death_date, $4)
         WHERE lower(display_name) = lower($1) AND deleted_at IS NULL`,
        [person.name, person.bio, person.birthDate, person.deathDate]
      )
    }
    return editionId
  })

  return { id, existed: false }
}

/**
 * Downloads the cover and author photos for a saved book. Runs after saving, in the background,
 * so "Save" is instant; if a picture can't be fetched the made-up cover is used instead.
 * Returns true if anything new was stored.
 */
export async function savePictures(pool: pg.Pool, id: string, book: CatalogBook, deps: Omit<ImportDeps, 'raw'>): Promise<boolean> {
  let changed = false
  if (book.coverUrl) {
    try {
      const { bytes } = await deps.fetchImage(book.coverUrl)
      if (deps.imageTools) {
        await storeBookCover(pool, deps.coversDir, id, bytes, deps.imageTools)
      } else {
        const path = await saveCover(deps.coversDir, 'books', id, bytes)
        await pool.query('UPDATE edition SET cover_path = $2 WHERE id = $1', [id, path])
      }
      changed = true
    } catch {
      /* no cover available */
    }
  }
  for (const person of book.contributors) {
    if (!person.photoUrl) continue
    const row = await pool.query<{ id: string; photo_path: string | null }>(
      'SELECT id, photo_path FROM person WHERE lower(display_name) = lower($1) AND deleted_at IS NULL',
      [person.name]
    )
    const p = row.rows[0]
    if (!p || p.photo_path) continue
    try {
      const { bytes } = await deps.fetchImage(person.photoUrl)
      const path = await saveCover(deps.coversDir, 'authors', p.id, bytes)
      await pool.query('UPDATE person SET photo_path = $2 WHERE id = $1', [p.id, path])
      changed = true
    } catch {
      /* no photo */
    }
  }
  return changed
}
