// @vitest-environment node
// Search, preview and "Add to…" end to end in a throwaway database, with the catalogues' answers
// served from saved files (no internet needed). Runs via `npm run test:db`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type pg from 'pg'
import { freshDatabase, hasDb } from '../helpers/testDb'
import { getDetails, listEditions, searchCatalog } from '../../src/main/services/catalog'
import { addFromCatalog, savePictures } from '../../src/main/services/importFromCatalog'
import { fetchImage, NetError } from '../../src/main/services/net'
import { getBook } from '../../src/main/db/repos/editions'
import { setSetting } from '../../src/main/db/repos/settings'

describe.skipIf(!hasDb)('online catalogue (simulated)', () => {
  let pool: pg.Pool
  let netDir: string
  let coversDir: string

  beforeAll(async () => {
    pool = await freshDatabase('home_library_test_catalog')
    netDir = mkdtempSync(join(tmpdir(), 'al-net-'))
    coversDir = mkdtempSync(join(tmpdir(), 'al-covers-'))
    cpSync(join(__dirname, '../fixtures/catalog'), netDir, { recursive: true })
    process.env.HOME_LIBRARY_FAKE_NET = netDir
  }, 60_000)

  afterAll(async () => {
    delete process.env.HOME_LIBRARY_FAKE_NET
    await pool?.end()
    rmSync(netDir, { recursive: true, force: true })
    rmSync(coversDir, { recursive: true, force: true })
  })

  it('searches both catalogues and merges the results', async () => {
    const { results, notices } = await searchCatalog(pool, 'Piranesi')
    expect(notices).toEqual([])
    expect(results[0]).toMatchObject({ title: 'Piranesi', authors: ['Susanna Clarke'], sources: ['openlibrary', 'google'] })
    expect(results[0].inLibraryId).toBeNull()
  })

  it('fetches every detail for the preview', async () => {
    const book = await getDetails(pool, { olWorkKey: 'OL20893680W', isbn: '9781526622426' })
    expect(book).toMatchObject({ title: 'Piranesi', isbn13: '9781526622426', pages: 272, language: 'English' })
    expect(book.contributors[0]).toMatchObject({ name: 'Susanna Clarke', birthDate: '01 November 1959' })
    expect(book.description).toMatch(/Piranesi's house/)
    expect(book.subjects.length).toBeGreaterThan(0)
  })

  it('lists editions, ones with covers first', async () => {
    const editions = await listEditions(pool, 'OL20893680W')
    expect(editions.length).toBeGreaterThan(5)
    const firstWithout = editions.findIndex((e) => !e.coverUrl)
    expect(editions.slice(firstWithout === -1 ? editions.length : firstWithout).every((e) => !e.coverUrl)).toBe(true)
  })

  it('adds to the To-read pile with every field, the cover and the author photo saved locally', async () => {
    const book = await getDetails(pool, { olWorkKey: 'OL20893680W', isbn: '9781526622426' })
    const added = await addFromCatalog(pool, book, 'to-read', { coversDir, fetchImage, raw: { test: true } })
    expect(added.existed).toBe(false)
    expect(await savePictures(pool, added.id, book, { coversDir, fetchImage })).toBe(true)
    expect(existsSync(join(coversDir, 'books', added.id))).toBe(true)

    const saved = await getBook(pool, added.id)
    expect(saved).toMatchObject({
      title: 'Piranesi',
      authors: ['Susanna Clarke'],
      isbn13: '9781526622426',
      pages: 272,
      ownership: 'owned',
      readingStatus: 'want',
      coverPath: `books/${added.id}`
    })
    // The website's rating (not yours), the catalogue's topics and links back to the catalogues.
    expect(saved?.ratingAvg).toBe(4.5)
    expect(saved?.ratingCount).toBe(128)
    expect(saved?.rating).toBeNull()
    expect(saved?.firstPublishedYear).toBe(2020)
    expect(saved?.subjects.length).toBeGreaterThan(0)
    expect(saved?.subjects).toEqual([...(saved?.subjects ?? [])].sort((a, b) => a.localeCompare(b)))
    expect(saved?.links).toContainEqual({ label: 'Open Library', url: 'https://openlibrary.org/works/OL20893680W' })
    expect(saved?.links.some((l) => l.label === 'Google Books' && l.url.startsWith('https://books.google.com/books?id='))).toBe(true)
    const extra = await pool.query(
      `SELECT e.first_published_year, e.rating_count, e.source_ids, e.catalog_raw,
              (SELECT count(*)::int FROM edition_subject es WHERE es.edition_id = e.id) AS subjects,
              p.bio, p.photo_path
       FROM edition e JOIN edition_contributor ec ON ec.edition_id = e.id JOIN person p ON p.id = ec.person_id
       WHERE e.id = $1`,
      [added.id]
    )
    expect(extra.rows[0].first_published_year).toBe(2020)
    expect(extra.rows[0].source_ids.olWorkKey).toBe('OL20893680W')
    expect(extra.rows[0].catalog_raw).toEqual({ test: true })
    expect(extra.rows[0].subjects).toBeGreaterThan(0)
    expect(extra.rows[0].bio).toMatch(/Susanna Mary Clarke/)
    expect(extra.rows[0].photo_path).toMatch(/^authors\//)
  })

  it('marks search results already in the library, and never adds the same ISBN twice', async () => {
    const { results } = await searchCatalog(pool, 'Piranesi')
    expect(results[0].inLibraryId).not.toBeNull()
    const book = await getDetails(pool, { olWorkKey: 'OL20893680W', isbn: '9781526622426' })
    const again = await addFromCatalog(pool, book, 'read', { coversDir, fetchImage })
    expect(again).toMatchObject({ existed: true, id: results[0].inLibraryId })
  })

  it('keeps working on Open Library alone when Google refuses (too many requests)', async () => {
    writeFileSync(
      join(netDir, 'fake-net.json'),
      JSON.stringify([
        { match: 'openlibrary.org/search.json', file: 'ol-search-piranesi.json' },
        { match: 'www.googleapis.com', status: 429 }
      ])
    )
    const { results, notices } = await searchCatalog(pool, 'piranesi clarke')
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.sources.includes('openlibrary'))).toBe(true)
    expect(notices).toEqual(['google_quota'])
  })

  it('says "offline" when there is no connection, but still searches what was cached', async () => {
    writeFileSync(join(netDir, 'OFFLINE'), '')
    await expect(searchCatalog(pool, 'something new')).rejects.toMatchObject({ kind: 'offline' } satisfies Partial<NetError>)
    const cached = await searchCatalog(pool, 'Piranesi')
    expect(cached.results[0].title).toBe('Piranesi')
    rmSync(join(netDir, 'OFFLINE'))
  })

  it('remembers a Google key in settings', async () => {
    await setSetting(pool, 'googleBooksApiKey', 'abc-123')
    const r = await pool.query("SELECT value FROM setting WHERE key = 'googleBooksApiKey'")
    expect(r.rows[0].value).toBe('abc-123')
    await setSetting(pool, 'googleBooksApiKey', '')
    expect((await pool.query("SELECT 1 FROM setting WHERE key = 'googleBooksApiKey'")).rowCount).toBe(0)
  })
})
