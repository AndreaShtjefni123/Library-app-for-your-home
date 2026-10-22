import type pg from 'pg'
import type {
  CatalogBook,
  CatalogEdition,
  CatalogNotice,
  CatalogRef,
  CatalogResult,
  CatalogSearch,
  LibraryHit,
  LocalSuggestions,
  SuggestMode
} from '../../../shared/catalog'
import { isValidIsbn, splitIsbn } from '../../../shared/isbn'
import { cacheGet, cachePut } from '../../db/repos/metadataCache'
import { getSetting, GOOGLE_KEY_SETTING } from '../../db/repos/settings'
import { NetError } from '../net'
import { findVolumeByIsbn, getVolume, mapVolume, searchGoogle, type GoogleVolume } from './googleBooks'
import { fold, matchKey, mergeDetails, mergeResults, rankSuggestions } from './merge'
import {
  authorKeysOf,
  getAuthor,
  getEdition,
  getEditionByIsbn,
  getEditions,
  getRatings,
  getWork,
  mapAuthor,
  mapEdition,
  searchOpenLibrary,
  workKeyOf,
  type OlEdition,
  type OlWork
} from './openLibrary'

const SEARCH_DAYS = 7
const DETAIL_DAYS = 30

const googleKey = (db: pg.Pool): Promise<string | null> => getSetting<string>(db, GOOGLE_KEY_SETTING)

/** Turns a failure from one source into a short notice for the screen. */
function noticeFor(source: 'google' | 'openlibrary', err: unknown): CatalogNotice {
  if (source === 'google') return err instanceof NetError && err.kind === 'quota' ? 'google_quota' : 'google_unavailable'
  return 'openlibrary_unavailable'
}

function rethrowIfAllOffline(errors: unknown[]): never {
  const offline = errors.find((e) => e instanceof NetError && (e.kind === 'offline' || e.kind === 'timeout'))
  throw offline ?? errors[0]
}

/** Marks results that are already in the library (same ISBN, or same title + author). */
export async function markInLibrary<T extends { title: string; authors?: string[]; isbn13?: string | null; ref: CatalogRef; inLibraryId: string | null }>(
  db: pg.Pool,
  items: T[]
): Promise<T[]> {
  if (!items.length) return items
  const isbns = items
    .map((r) => r.isbn13 ?? (r.ref.isbn ? splitIsbn(r.ref.isbn)?.isbn13 : null))
    .filter((x): x is string => Boolean(x))
  const titles = items.map((r) => r.title.toLowerCase())
  const rows = await db.query<{ id: string; isbn13: string | null; title: string; authors: string[] }>(
    `SELECT e.id, e.isbn13, e.title,
       coalesce((SELECT array_agg(p.display_name ORDER BY ec.position) FROM edition_contributor ec
                 JOIN person p ON p.id = ec.person_id WHERE ec.edition_id = e.id AND ec.role = 'author'), '{}') AS authors
     FROM edition e
     WHERE e.deleted_at IS NULL AND (e.isbn13 = ANY($1) OR lower(e.title) = ANY($2))`,
    [isbns, titles]
  )
  const byIsbn = new Map(rows.rows.filter((r) => r.isbn13).map((r) => [r.isbn13!, r.id]))
  const byKey = new Map(rows.rows.map((r) => [matchKey(r.title, r.authors), r.id]))
  return items.map((r) => {
    const isbn13 = r.isbn13 ?? (r.ref.isbn ? splitIsbn(r.ref.isbn)?.isbn13 : undefined)
    const id = (isbn13 && byIsbn.get(isbn13)) || byKey.get(matchKey(r.title, r.authors ?? [])) || null
    return { ...r, inLibraryId: id }
  })
}

export async function searchCatalog(db: pg.Pool, rawQuery: string): Promise<CatalogSearch> {
  const q = rawQuery.trim().replace(/\s+/g, ' ')
  if (!q) return { results: [], notices: [] }
  const cacheKey = `search:${q.toLowerCase()}`
  const cached = await cacheGet<CatalogResult[]>(db, cacheKey, SEARCH_DAYS)
  if (cached) return { results: await markInLibrary(db, cached), notices: [] }

  const key = await googleKey(db)
  const [ol, google] = await Promise.allSettled([searchOpenLibrary(q), searchGoogle(q, key)])
  if (ol.status === 'rejected' && google.status === 'rejected') rethrowIfAllOffline([ol.reason, google.reason])

  const notices: CatalogNotice[] = []
  if (ol.status === 'rejected') notices.push(noticeFor('openlibrary', ol.reason))
  if (google.status === 'rejected') notices.push(noticeFor('google', google.reason))

  const results = mergeResults(ol.status === 'fulfilled' ? ol.value : [], google.status === 'fulfilled' ? google.value : [])
  if (ol.status === 'fulfilled') await cachePut(db, cacheKey, results)
  await rememberSeen(db, results).catch(() => {})
  return { results: await markInLibrary(db, results), notices }
}

const orNull = <T>(p: Promise<T>): Promise<T | null> =>
  p.catch((err) => {
    if (err instanceof NetError && err.kind === 'not_found') return null
    throw err
  })

const SUGGESTIONS = 8
/** After the main suggestion search answers, wait at most this long for the helper search. */
const HELPER_GRACE_MS = 800

/** Remembers books seen in online searches, so they can be suggested instantly next time. */
export async function rememberSeen(db: pg.Pool, results: CatalogResult[]): Promise<void> {
  const rows = results.filter((r) => r.ref.olWorkKey || r.ref.googleId).slice(0, 40)
  if (!rows.length) return
  await db.query(
    `INSERT INTO catalog_seen (key, result, search_text)
     SELECT * FROM unnest($1::text[], $2::jsonb[], $3::text[])
     ON CONFLICT (key) DO UPDATE SET result = EXCLUDED.result, search_text = EXCLUDED.search_text, seen_at = now()`,
    [
      rows.map((r) => r.ref.olWorkKey ?? `g:${r.ref.googleId}`),
      rows.map((r) => JSON.stringify({ ...r, inLibraryId: null })),
      rows.map((r) => fold(`${r.title} ${r.authors.join(' ')}`))
    ]
  )
}

const LOCAL_LIBRARY = 4

/**
 * Instant suggestions from this PC (no internet): matching books in your library, and books seen
 * in earlier searches. Each typed word must appear; the last one may be unfinished.
 */
export async function suggestLocal(db: pg.Pool, rawQuery: string): Promise<LocalSuggestions> {
  const q = fold(rawQuery)
  if (q.length < 2) return { library: [], seen: [] }
  const patterns = q.split(' ').map((w) => `%${w.replace(/[\\%_]/g, (c) => '\\' + c)}%`)

  const library = await db.query<{ id: string; title: string; authors: string[]; pub_year: number | null; cover_path: string | null }>(
    `SELECT e.id, e.title, e.pub_year, e.cover_path,
       coalesce((SELECT array_agg(p.display_name ORDER BY ec.position) FROM edition_contributor ec
                 JOIN person p ON p.id = ec.person_id WHERE ec.edition_id = e.id AND ec.role = 'author'), '{}') AS authors
     FROM edition e
     WHERE e.deleted_at IS NULL
       AND (SELECT bool_and(
              lower(e.title || ' ' || coalesce((SELECT string_agg(p.display_name, ' ') FROM edition_contributor ec
                                                JOIN person p ON p.id = ec.person_id WHERE ec.edition_id = e.id), ''))
              LIKE pat)
            FROM unnest($1::text[]) pat)
     ORDER BY e.sort_title
     LIMIT 20`,
    [patterns]
  )
  const seen = await db.query<{ result: CatalogResult }>(
    `SELECT result FROM catalog_seen
     WHERE (SELECT bool_and(search_text LIKE pat) FROM unnest($1::text[]) pat)
     ORDER BY seen_at DESC
     LIMIT 60`,
    [patterns]
  )

  const hits: LibraryHit[] = library.rows
    .map((r) => ({ id: r.id, title: r.title, authors: r.authors, pubYear: r.pub_year, coverPath: r.cover_path }))
    .filter((h) => rankSuggestions([asResult(h)], rawQuery, 1).length > 0)
    .slice(0, LOCAL_LIBRARY)
  const ranked = rankSuggestions(seen.rows.map((r) => r.result), rawQuery, SUGGESTIONS)
  return { library: hits, seen: await markInLibrary(db, ranked) }
}

const asResult = (h: LibraryHit): CatalogResult => ({
  ref: {},
  title: h.title,
  subtitle: null,
  authors: h.authors,
  firstPublishYear: h.pubYear,
  editionCount: null,
  pages: null,
  coverUrl: null,
  sources: [],
  inLibraryId: h.id
})

/**
 * Online suggestions while typing. Open Library matches whole words only (and shortens them:
 * "darkness" is stored as "dark"), so the main search treats the last, half-typed word as a
 * prefix. 'quick' answers as soon as that returns; 'full' also adds a helper search without the
 * half-typed word, which catches books the prefix misses. Ranking keeps only real matches.
 */
export async function suggestCatalog(db: pg.Pool, rawQuery: string, mode: SuggestMode = 'full'): Promise<CatalogResult[]> {
  const q = rawQuery.trim().replace(/\s+/g, ' ')
  if (q.length < 2) return []
  const cacheKey = `suggest:${q.toLowerCase()}`
  const cached = await cacheGet<CatalogResult[]>(db, cacheKey, SEARCH_DAYS)
  if (cached) return markInLibrary(db, cached)

  const isbn = isValidIsbn(q)
  const words = q.split(' ')
  const mainP = searchOpenLibrary(isbn ? q : `${q}*`, isbn ? SUGGESTIONS : 10)
  const helperP =
    mode === 'quick' || isbn ? Promise.resolve([]) : searchOpenLibrary(words.length > 1 ? words.slice(0, -1).join(' ') : q, 10)
  helperP.catch(() => {})
  const main = await mainP.catch((err: unknown) => err as Error)
  const helper =
    mode === 'quick'
      ? []
      : await Promise.race([
          helperP.catch(() => null),
          new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), main instanceof Error ? 8000 : HELPER_GRACE_MS))
        ])
  if (main instanceof Error && !helper) throw main
  const complete = mode === 'full' && !(main instanceof Error) && helper !== undefined

  // One entry per book: Open Library often lists the same title by the same author several times.
  const seen = new Set<string>()
  const pool = [main instanceof Error ? [] : main, helper ?? []].flat().filter((r) => {
    const keys = [r.ref.olWorkKey ?? '', matchKey(r.title, r.authors)]
    if (keys.some((k) => k && seen.has(k))) return false
    keys.forEach((k) => k && seen.add(k))
    return true
  })
  const results = isbn ? pool.slice(0, SUGGESTIONS) : rankSuggestions(pool, q, SUGGESTIONS)
  await rememberSeen(db, pool).catch(() => {})
  // Only remember complete answers; a partial one is shown now and improved moments later.
  if (complete) await cachePut(db, cacheKey, results)
  return markInLibrary(db, results)
}

/** Picks the most useful printing when the user hasn't chosen one: has an ISBN and a cover, English first. */
export function bestEdition(entries: OlEdition[]): OlEdition | null {
  const score = (e: OlEdition): number => {
    const m = mapEdition(e)
    return (m.isbn13 ? 4 : 0) + (m.coverUrl ? 2 : 0) + (m.language === 'English' ? 1 : 0) + (m.pages ? 1 : 0)
  }
  return [...entries].sort((a, b) => score(b) - score(a))[0] ?? null
}

interface DetailsCacheEntry {
  book: CatalogBook
  raw: { work: OlWork | null; edition: OlEdition | null; google: GoogleVolume | null }
}

function refKey(ref: CatalogRef): string {
  return `details:${ref.olWorkKey ?? ''}:${ref.olEditionKey ?? ''}:${ref.googleId ?? ''}:${ref.isbn ?? ''}`
}

/** Everything about one book, gathered from both catalogues. */
export async function getDetails(db: pg.Pool, ref: CatalogRef): Promise<CatalogBook> {
  const entry = await getDetailsEntry(db, ref)
  const [marked] = await markInLibrary(db, [{ ...entry.book, authors: entry.book.contributors.map((c) => c.name) }])
  return { ...entry.book, inLibraryId: marked.inLibraryId }
}

/** Also used when adding a book, to keep the catalogues' original answers. */
export async function getDetailsEntry(db: pg.Pool, ref: CatalogRef): Promise<DetailsCacheEntry> {
  const cached = await cacheGet<DetailsCacheEntry>(db, refKey(ref), DETAIL_DAYS)
  if (cached) return cached

  const isbn = ref.isbn && isValidIsbn(ref.isbn) ? ref.isbn : undefined
  const errors: unknown[] = []
  const safe = <T>(p: Promise<T | null>): Promise<T | null> =>
    p.catch((err) => {
      errors.push(err)
      return null
    })

  const key = await googleKey(db)
  const none = Promise.resolve(null)

  // Ask for everything we already know about at the same time, instead of one after another.
  // Only when a key is missing (e.g. we just have an ISBN) do we wait for the printing to learn it.
  const editionP = safe(ref.olEditionKey ? orNull(getEdition(ref.olEditionKey)) : isbn ? orNull(getEditionByIsbn(isbn)) : none)
  const workKeyP = ref.olWorkKey ? Promise.resolve(ref.olWorkKey) : editionP.then((e) => workKeyOf(e))
  const workP = workKeyP.then((k) => safe(k ? orNull(getWork(k)) : none))
  const ratingsP = workKeyP.then((k) => safe(k ? getRatings(k) : none))
  const editionsP = Promise.all([workKeyP, editionP]).then(([k, e]) => safe(k && !e ? getEditions(k) : none))
  const knownAuthors = ref.olAuthorKeys?.length
    ? Promise.all(ref.olAuthorKeys.map((k) => safe(getAuthor(k))))
    : Promise.all([workP, editionP]).then(([w, e]) => Promise.all(authorKeysOf(w, e).map((k) => safe(getAuthor(k)))))
  const googleP = safe(
    (async (): Promise<GoogleVolume | null> => {
      // Open the exact Google entry if we know it; otherwise (or if that fails) look it up by ISBN.
      const byId = ref.googleId ? await orNull(getVolume(ref.googleId, key)) : null
      if (byId) return byId
      const e = isbn ? null : await editionP
      const googleIsbn = isbn ?? (e ? (mapEdition(e).isbn13 ?? undefined) : undefined)
      return googleIsbn ? findVolumeByIsbn(googleIsbn, key) : null
    })()
  )

  let [edition, work, ratings, editions, authorResults, googleVol] = await Promise.all([
    editionP,
    workP,
    ratingsP,
    editionsP,
    knownAuthors,
    googleP
  ])
  if (!edition && editions) edition = bestEdition(editions.entries)
  const authors = authorResults.map((a) => (a ? mapAuthor(a) : null)).filter((a): a is NonNullable<typeof a> => a !== null)

  const book = mergeDetails({
    work,
    edition,
    authors,
    ratings: ratings?.summary ?? null,
    editionCount: editions?.size ?? null,
    google: googleVol ? mapVolume(googleVol) : null,
    googleId: googleVol?.id ?? ref.googleId ?? null
  })
  if (!book) {
    if (errors.length) rethrowIfAllOffline(errors)
    throw new NetError('not_found', 'That book could not be found in either catalogue')
  }

  const entry: DetailsCacheEntry = { book, raw: { work, edition, google: googleVol } }
  // Only remember complete answers, so a temporary hiccup doesn't get cached for a month.
  if (!errors.some((e) => e instanceof NetError && e.kind !== 'not_found' && e.kind !== 'quota')) {
    await cachePut(db, refKey(ref), entry)
  }
  return entry
}

/** All printings of a book, best-looking first (with a cover and an ISBN), newest first. */
export async function listEditions(db: pg.Pool, workKey: string): Promise<CatalogEdition[]> {
  const cacheKey = `editions:${workKey}`
  const cached = await cacheGet<CatalogEdition[]>(db, cacheKey, DETAIL_DAYS)
  if (cached) return cached
  const { entries } = await getEditions(workKey)
  const list = entries
    .map(mapEdition)
    .filter((e) => e.title)
    .sort(
      (a, b) =>
        Number(Boolean(b.coverUrl)) - Number(Boolean(a.coverUrl)) ||
        Number(Boolean(b.isbn13)) - Number(Boolean(a.isbn13)) ||
        (b.pubDate ?? '').slice(0, 4).localeCompare((a.pubDate ?? '').slice(0, 4))
    )
  await cachePut(db, cacheKey, list)
  return list
}
