// @vitest-environment node
// Runs against a throwaway database via `npm run test:db`; skipped by plain `npm test`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { hasDb, freshDatabase } from '../helpers/testDb'
import {
  addCopy,
  countBooks,
  createBook,
  deleteBook,
  getBook,
  listBooks,
  orderedIds,
  restoreBook,
  updateBook
} from '../../src/main/db/repos/editions'
import { findDuplicates } from '../../src/main/db/repos/duplicates'
import { setOwnership, setReadingStatus, shelfCounts } from '../../src/main/db/repos/shelves'
import type { BookInput } from '../../src/shared/books'

const book = (title: string, extra: Partial<BookInput> = {}): BookInput => ({
  title,
  contributors: [],
  ownership: 'owned',
  ...extra
})

describe.skipIf(!hasDb)('books in PostgreSQL', () => {
  let pool: pg.Pool

  beforeAll(async () => {
    pool = await freshDatabase('home_library_test')
  }, 60_000)

  afterAll(async () => {
    await pool?.end()
  })

  it('saves every field and reads it back', async () => {
    const id = await createBook(pool, {
      title: 'Piranesi',
      contributors: [{ name: 'Susanna Clarke', role: 'author' }],
      publisher: 'Bloomsbury',
      pubDate: '2020-09-15',
      pages: 272,
      isbn: '978-1-5266-2242-6',
      format: 'hardcover',
      language: 'English',
      description: 'A house of endless halls.',
      seriesName: 'Standalones',
      seriesNumber: 1,
      ownership: 'owned',
      readingStatus: 'read'
    })
    const b = await getBook(pool, id)
    expect(b).toMatchObject({
      title: 'Piranesi',
      sortTitle: 'piranesi',
      authors: ['Susanna Clarke'],
      publisher: 'Bloomsbury',
      pubDate: '2020-09-15',
      pubYear: 2020,
      pages: 272,
      isbn13: '9781526622426',
      isbn10: '1526622424',
      format: 'hardcover',
      ownership: 'owned',
      readingStatus: 'read',
      series: { name: 'Standalones', number: 1 }
    })
    expect(b?.copies).toHaveLength(1)
    expect(b?.copies[0].accessionNo).toMatch(/^AL-\d{6}$/)
    expect(b?.finishedAt).not.toBeNull()
  })

  it('reuses existing authors and publishers instead of duplicating them', async () => {
    await createBook(
      pool,
      book('Jonathan Strange & Mr Norrell', { contributors: [{ name: 'susanna clarke', role: 'author' }] })
    )
    const r = await pool.query("SELECT count(*)::int AS n FROM person WHERE lower(display_name) = 'susanna clarke'")
    expect(r.rows[0].n).toBe(1)
  })

  it('lists and sorts, ignoring "The" in titles', async () => {
    await createBook(pool, book('The Hobbit', { contributors: [{ name: 'J.R.R. Tolkien', role: 'author' }], pubDate: '1937' }))
    await createBook(pool, book('Abel’s Island', { pubDate: '1976' }))
    const byTitle = await listBooks(pool, { sort: 'title', dir: 'asc', offset: 0, limit: 50 })
    const titles = byTitle.items.map((b) => b.title)
    expect(titles.indexOf('Abel’s Island')).toBeLessThan(titles.indexOf('The Hobbit'))
    expect(titles.indexOf('The Hobbit')).toBeLessThan(titles.indexOf('Piranesi'))
    expect(byTitle.total).toBe(4)

    const byYear = await listBooks(pool, { sort: 'year', dir: 'desc', offset: 0, limit: 1 })
    expect(byYear.items[0].title).toBe('Piranesi')
    expect(byYear.total).toBe(4)
  })

  it('pages through results', async () => {
    const page2 = await listBooks(pool, { sort: 'title', dir: 'asc', offset: 2, limit: 2 })
    expect(page2.items).toHaveLength(2)
    expect(await orderedIds(pool, { sort: 'title', dir: 'asc' })).toHaveLength(4)
  })

  it('updates details and replaces authors', async () => {
    const id = await createBook(pool, book('Wrong Title', { contributors: [{ name: 'Someone', role: 'author' }] }))
    await updateBook(pool, id, { title: 'Right Title', contributors: [{ name: 'Someone Else', role: 'editor' }], pages: 99 })
    const b = await getBook(pool, id)
    expect(b?.title).toBe('Right Title')
    expect(b?.contributors).toEqual([{ name: 'Someone Else', role: 'editor' }])
    expect(b?.pages).toBe(99)
  })

  it('moves deleted books to the Trash and can restore them', async () => {
    const before = await countBooks(pool)
    const id = await createBook(pool, book('Delete Me'))
    await deleteBook(pool, id)
    expect(await countBooks(pool)).toBe(before)
    expect(await getBook(pool, id)).toBeNull()
    await restoreBook(pool, id)
    expect((await getBook(pool, id))?.title).toBe('Delete Me')
  })

  it('finds duplicates by ISBN and by a similar title + author', async () => {
    const byIsbn = await findDuplicates(pool, { title: 'Something else', isbn: '1526622424', contributors: [] })
    expect(byIsbn[0]).toMatchObject({ title: 'Piranesi', reason: 'isbn' })

    const byTitle = await findDuplicates(pool, {
      title: 'Hobbit',
      contributors: [{ name: 'JRR Tolkien', role: 'author' }]
    })
    expect(byTitle.map((d) => d.title)).toContain('The Hobbit')

    const different = await findDuplicates(pool, {
      title: 'The Hobbit',
      contributors: [{ name: 'Completely Different Person', role: 'author' }]
    })
    expect(different).toHaveLength(0)

    const unrelated = await findDuplicates(pool, { title: 'Moby-Dick', contributors: [] })
    expect(unrelated).toHaveLength(0)
  })

  it('adds another copy of an existing book', async () => {
    const [piranesi] = await findDuplicates(pool, { title: 'Piranesi', contributors: [] })
    await addCopy(pool, piranesi.id)
    expect((await getBook(pool, piranesi.id))?.copies).toHaveLength(2)
  })

  it('counts shelves; a book can be owned and on the to-read pile at once', async () => {
    const id = await createBook(pool, book('Owned and Waiting', { readingStatus: 'want' }))
    const wish = await createBook(pool, book('Wanted', { ownership: 'wishlist' }))
    const counts = await shelfCounts(pool)
    expect(counts['to-read']).toBeGreaterThanOrEqual(1)
    expect(counts['want-to-buy']).toBe(1)
    const own = await listBooks(pool, { shelf: 'own', sort: 'title', dir: 'asc', offset: 0, limit: 100 })
    expect(own.items.map((b) => b.id)).toContain(id)
    expect(own.items.map((b) => b.id)).not.toContain(wish)

    await setOwnership(pool, wish, 'owned')
    expect((await getBook(pool, wish))?.copies).toHaveLength(1)
  })

  it('Partly read: keeps progress and note, sorts most-read first, and can resume or finish', async () => {
    const a = await createBook(pool, book('Half Done', { pages: 200 }))
    const b = await createBook(pool, book('Nearly Done', { pages: 200 }))
    const c = await createBook(pool, book('Percent Only'))
    await setReadingStatus(pool, { id: a, status: 'partly_read', currentPage: 100, note: 'Stopped at chapter 12' })
    await setReadingStatus(pool, { id: b, status: 'partly_read', currentPage: 180 })
    await setReadingStatus(pool, { id: c, status: 'partly_read', progressPercent: 60 })

    const shelf = await listBooks(pool, { shelf: 'partly-read', sort: 'progress', dir: 'desc', offset: 0, limit: 10 })
    expect(shelf.items.map((x) => [x.title, x.progressPercent])).toEqual([
      ['Nearly Done', 90],
      ['Percent Only', 60],
      ['Half Done', 50]
    ])
    expect(shelf.items[2].pausedNote).toBe('Stopped at chapter 12')
    expect(shelf.items[2].lastReadAt).not.toBeNull()

    await setReadingStatus(pool, { id: a, status: 'reading' })
    const resumed = await getBook(pool, a)
    expect(resumed?.readingStatus).toBe('reading')
    expect(resumed?.currentPage).toBe(100)
    expect(resumed?.pausedNote).toBeNull()

    await setReadingStatus(pool, { id: b, status: 'read' })
    const finished = await getBook(pool, b)
    expect(finished?.readingStatus).toBe('read')
    expect(finished?.finishedAt).not.toBeNull()

    await setReadingStatus(pool, { id: c, status: null })
    expect((await getBook(pool, c))?.readingStatus).toBeNull()
  })

  it('handles 1,000 books quickly', async () => {
    const big = await freshDatabase('home_library_test_big')
    try {
      await big.query(`
        INSERT INTO edition (title, sort_title, pub_year, pages, record_status)
        SELECT 'Book ' || g, 'book ' || g, 1900 + g % 120, 100 + g % 500, 'owned' FROM generate_series(1, 1000) g`)
      const started = performance.now()
      const page = await listBooks(big, { sort: 'author', dir: 'asc', offset: 800, limit: 200 })
      const ms = performance.now() - started
      expect(page.total).toBe(1000)
      expect(page.items).toHaveLength(200)
      expect(ms).toBeLessThan(500)
    } finally {
      await big.end()
    }
  }, 60_000)
})
