// @vitest-environment node
// "Make it yours" against a throwaway database (run via `npm run test:db`).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type pg from 'pg'
import { freshDatabase, hasDb } from '../helpers/testDb'
import { createBook, getBook } from '../../src/main/db/repos/editions'
import { setReadingStatus } from '../../src/main/db/repos/shelves'
import {
  allTags,
  listCopies,
  listProgress,
  listQuotes,
  logProgress,
  orderQuotes,
  saveQuote,
  setRating,
  setTags,
  setWriting,
  snoozeSuggestion,
  updateCopy
} from '../../src/main/db/repos/personal'
import { removeBookCover, restorePreviousCover, storeBookCover } from '../../src/main/services/covers'
import type { ImageTools } from '../../src/main/services/imageTools'

const fakeTools: ImageTools = { thumbnail: (b) => b.subarray(0, 10), mainColour: () => '#2f5d50' }

describe.skipIf(!hasDb)('make it yours', () => {
  let pool: pg.Pool
  let book: string
  let dir: string

  beforeAll(async () => {
    pool = await freshDatabase('home_library_test_mine')
    book = await createBook(pool, { title: 'Piranesi', contributors: [], pages: 272, ownership: 'owned' })
    dir = mkdtempSync(join(tmpdir(), 'al-mine-'))
  }, 60_000)

  afterAll(async () => {
    await pool?.end()
    rmSync(dir, { recursive: true, force: true })
  })

  it('records your copy: where it is, where you got it, price, condition, signed…', async () => {
    const [copy] = await listCopies(pool, book)
    const saved = await updateCopy(pool, copy.id, {
      locationNote: 'Living room, shelf 3',
      acquiredDate: '2023-12-24',
      acquiredSource: 'Waterstones',
      price: '18.99',
      currency: 'EUR',
      condition: 'very_good',
      giftFrom: 'Mum',
      isSigned: true,
      signedBy: 'Susanna Clarke',
      isFirstEdition: true,
      limitedNumber: '12/500'
    })
    expect(saved).toMatchObject({
      locationNote: 'Living room, shelf 3',
      acquiredDate: '2023-12-24',
      price: '18.99',
      condition: 'very_good',
      isSigned: true,
      isFirstEdition: true,
      limitedNumber: '12/500'
    })
  })

  it('keeps your rating, review and private notes on the book', async () => {
    await setRating(pool, book, 4.5)
    await setWriting(pool, book, 'review', 'Strange and wonderful.')
    await setWriting(pool, book, 'notes', '  ')
    const b = await getBook(pool, book)
    expect(b).toMatchObject({ rating: 4.5, review: 'Strange and wonderful.', notes: null })
  })

  it('tags without duplicates, reusing existing ones', async () => {
    await setTags(pool, book, ['Fantasy', 'fantasy', 'Favourites', ' '])
    const b = await getBook(pool, book)
    expect(b?.tags.sort()).toEqual(['Fantasy', 'Favourites'])
    expect(await allTags(pool)).toEqual(expect.arrayContaining(['Fantasy', 'Favourites']))
  })

  it('keeps quotes in the order you choose', async () => {
    await saveQuote(pool, book, { text: 'The Beauty of the House is immeasurable', page: 5, comment: null })
    await saveQuote(pool, book, { text: 'Its Kindness infinite.', page: 6, comment: 'Love this' })
    const quotes = await listQuotes(pool, book)
    expect(quotes.map((q) => q.page)).toEqual([5, 6])
    await orderQuotes(pool, book, [quotes[1].id, quotes[0].id])
    expect((await listQuotes(pool, book)).map((q) => q.page)).toEqual([6, 5])
  })

  it('logging a page moves the book to Currently reading and works out the %', async () => {
    const pct = await logProgress(pool, book, 136, null)
    expect(pct).toBe(50)
    const b = await getBook(pool, book)
    expect(b).toMatchObject({ readingStatus: 'reading', currentPage: 136, progressPercent: 50 })
    expect(b?.startedAt).not.toBeNull()
    expect(await listProgress(pool, book)).toHaveLength(1)
  })

  it('percent works for books without a page count', async () => {
    const ebook = await createBook(pool, { title: 'No Pages', contributors: [], ownership: 'owned' })
    await logProgress(pool, ebook, null, 30)
    expect((await getBook(pool, ebook))?.progressPercent).toBe(30)
  })

  it('moving to Partly read with a page also goes in the reading log', async () => {
    await setReadingStatus(pool, { id: book, status: 'partly_read', currentPage: 200, note: 'chapter 9' })
    const log = await listProgress(pool, book)
    expect(log[0]).toMatchObject({ page: 200 })
  })

  it('snoozing or turning off the "haven’t read this in a while?" suggestion', async () => {
    await snoozeSuggestion(pool, book, 14)
    const snoozed = await getBook(pool, book)
    expect(new Date(snoozed!.suggestSnoozedUntil!).getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000)
    await snoozeSuggestion(pool, book, null)
    expect(new Date((await getBook(pool, book))!.suggestSnoozedUntil!).getFullYear()).toBe(9999)
  })

  it('changing a cover keeps the old one for Undo; removing shows the made-up cover', async () => {
    await storeBookCover(pool, dir, book, Buffer.from('first-cover-bytes'), fakeTools)
    await storeBookCover(pool, dir, book, Buffer.from('second-cover-bytes'), fakeTools)
    expect((await getBook(pool, book))?.spineColour).toBe('#2f5d50')
    expect(existsSync(join(dir, 'books', `${book}.prev`))).toBe(true)
    await restorePreviousCover(pool, dir, book, fakeTools)
    expect((await getBook(pool, book))?.coverPath).toBe(`books/${book}`)
    await removeBookCover(pool, dir, book)
    expect((await getBook(pool, book))?.coverPath).toBeNull()
  })
})
