import type { CatalogEdition, CatalogPerson, CatalogResult } from '../../../shared/catalog'
import { isValidIsbn10, isValidIsbn13, normalizeIsbn, splitIsbn } from '../../../shared/isbn'
import { fetchJson, NetError } from '../net'
import { cleanTitle, formatFrom, isoDateFrom, languageName, plainText, seriesFrom, yearFrom } from './text'

const BASE = 'https://openlibrary.org'
export const olCover = (id: number): string => `https://covers.openlibrary.org/b/id/${id}-L.jpg?default=false`
const olAuthorPhoto = (id: number): string => `https://covers.openlibrary.org/a/id/${id}-L.jpg?default=false`
const lastPart = (key: string): string => key.split('/').pop()!

// ---------- Raw shapes (only the fields we read) ----------

export interface OlSearchDoc {
  key: string
  title?: string
  subtitle?: string
  author_name?: string[]
  author_key?: string[]
  first_publish_year?: number
  edition_count?: number
  isbn?: string[]
  cover_i?: number
  cover_edition_key?: string
  number_of_pages_median?: number
}

export interface OlWork {
  key: string
  title?: string
  subtitle?: string
  description?: string | { value: string }
  subjects?: string[]
  covers?: number[]
  authors?: { author?: { key: string } }[]
  first_publish_date?: string
}

export interface OlEdition {
  key: string
  title?: string
  subtitle?: string
  publishers?: string[]
  publish_date?: string
  number_of_pages?: number
  pagination?: string
  languages?: { key: string }[]
  isbn_13?: string[]
  isbn_10?: string[]
  physical_format?: string
  covers?: number[]
  series?: string[]
  works?: { key: string }[]
  authors?: { key: string }[]
  by_statement?: string
  translated_from?: { key: string }[]
  contributors?: { role?: string; name?: string }[]
}

export interface OlAuthor {
  name?: string
  personal_name?: string
  bio?: string | { value: string }
  birth_date?: string
  death_date?: string
  photos?: number[]
}

export interface OlRatings {
  summary?: { average?: number; count?: number }
}

// ---------- Mapping ----------

const SEARCH_FIELDS =
  'key,title,subtitle,author_name,author_key,first_publish_year,edition_count,isbn,cover_i,cover_edition_key,number_of_pages_median'

/** Prefer 978/979 ISBN-13s; fall back to converting an ISBN-10. */
function firstIsbn13(list: string[] | undefined): string | null {
  for (const raw of list ?? []) if (isValidIsbn13(raw)) return normalizeIsbn(raw)
  for (const raw of list ?? []) if (isValidIsbn10(raw)) return splitIsbn(raw)!.isbn13
  return null
}

export function mapSearchDoc(d: OlSearchDoc): CatalogResult | null {
  const title = cleanTitle(d.title)
  if (!title) return null
  return {
    ref: {
      olWorkKey: lastPart(d.key),
      olEditionKey: d.cover_edition_key,
      isbn: firstIsbn13(d.isbn) ?? undefined,
      olAuthorKeys: d.author_key?.slice(0, 4)
    },
    title,
    subtitle: cleanTitle(d.subtitle),
    authors: d.author_name ?? [],
    firstPublishYear: d.first_publish_year ?? null,
    editionCount: d.edition_count ?? null,
    pages: d.number_of_pages_median ?? null,
    coverUrl: d.cover_i ? olCover(d.cover_i) : null,
    sources: ['openlibrary'],
    inLibraryId: null
  }
}

/** "xvii, 249" → 249 when number_of_pages is missing. */
function pagesFrom(e: OlEdition): number | null {
  if (e.number_of_pages && e.number_of_pages > 0) return e.number_of_pages
  const nums = (e.pagination ?? '').match(/\d+/g)
  return nums ? Math.max(...nums.map(Number)) || null : null
}

export function mapEdition(e: OlEdition): CatalogEdition {
  const isbn13 = firstIsbn13([...(e.isbn_13 ?? []), ...(e.isbn_10 ?? [])])
  const isbn10 = (e.isbn_10 ?? []).find(isValidIsbn10) ?? (isbn13 ? splitIsbn(isbn13)?.isbn10 : null) ?? null
  return {
    key: lastPart(e.key),
    title: cleanTitle(e.title) ?? '',
    subtitle: cleanTitle(e.subtitle),
    publisher: cleanTitle(e.publishers?.[0]),
    pubDate: isoDateFrom(e.publish_date),
    pages: pagesFrom(e),
    language: languageName(e.languages?.[0]?.key),
    isbn13,
    isbn10: isbn10 ? normalizeIsbn(isbn10) : null,
    format: formatFrom(e.physical_format),
    coverUrl: e.covers?.find((c) => c > 0) ? olCover(e.covers.find((c) => c > 0)!) : null
  }
}

export function mapAuthor(a: OlAuthor): CatalogPerson | null {
  const name = cleanTitle(a.name ?? a.personal_name)
  if (!name) return null
  const photo = a.photos?.find((p) => p > 0)
  return {
    name,
    role: 'author',
    bio: plainText(a.bio),
    birthDate: cleanTitle(a.birth_date),
    deathDate: cleanTitle(a.death_date),
    photoUrl: photo ? olAuthorPhoto(photo) : null
  }
}

export function workDescription(w: OlWork): string | null {
  return plainText(w.description)
}

export function workSubjects(w: OlWork): string[] {
  // Open Library subjects mix genres with noise like "nyt:hardcover-fiction=2020-09-27".
  return (w.subjects ?? [])
    .filter((s) => !/[:=]/.test(s) && s.length <= 60)
    .map((s) => s.trim())
    .filter((s, i, all) => s && all.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i)
    .slice(0, 15)
}

export function editionSeries(e: OlEdition | null): { name: string; number: number | null } | null {
  return seriesFrom(e?.series?.[0])
}

export { yearFrom }

// ---------- Requests ----------

export async function searchOpenLibrary(q: string, limit = 24): Promise<CatalogResult[]> {
  const isbn = normalizeIsbn(q)
  const query = isValidIsbn10(isbn) || isValidIsbn13(isbn) ? `isbn:${isbn}` : q
  const url = `${BASE}/search.json?q=${encodeURIComponent(query)}&limit=${limit}&fields=${SEARCH_FIELDS}`
  const data = await fetchJson<{ docs?: OlSearchDoc[] }>(url)
  return (data.docs ?? []).map(mapSearchDoc).filter((r): r is CatalogResult => r !== null)
}

export const getWork = (key: string): Promise<OlWork> => fetchJson<OlWork>(`${BASE}/works/${key}.json`)
export const getEdition = (key: string): Promise<OlEdition> => fetchJson<OlEdition>(`${BASE}/books/${key}.json`)
export const getEditionByIsbn = (isbn: string): Promise<OlEdition> => fetchJson<OlEdition>(`${BASE}/isbn/${isbn}.json`)
export const getAuthor = (key: string): Promise<OlAuthor> => fetchJson<OlAuthor>(`${BASE}/authors/${key}.json`)

export async function getRatings(workKey: string): Promise<OlRatings | null> {
  try {
    return await fetchJson<OlRatings>(`${BASE}/works/${workKey}/ratings.json`)
  } catch (err) {
    if (err instanceof NetError && err.kind === 'not_found') return null
    throw err
  }
}

export async function getEditions(workKey: string): Promise<{ entries: OlEdition[]; size: number }> {
  const data = await fetchJson<{ entries?: OlEdition[]; size?: number }>(`${BASE}/works/${workKey}/editions.json?limit=100`)
  return { entries: data.entries ?? [], size: data.size ?? 0 }
}

export const workKeyOf = (e: OlEdition | null): string | undefined => (e?.works?.[0]?.key ? lastPart(e.works[0].key) : undefined)
export const authorKeysOf = (w: OlWork | null, e: OlEdition | null): string[] =>
  [...(w?.authors ?? []).map((a) => a.author?.key), ...(e?.authors ?? []).map((a) => a.key)]
    .filter((k): k is string => Boolean(k))
    .map(lastPart)
    .filter((k, i, all) => all.indexOf(k) === i)
    .slice(0, 6)
