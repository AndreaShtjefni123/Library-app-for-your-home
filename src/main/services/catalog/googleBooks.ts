import type { CatalogResult } from '../../../shared/catalog'
import { isValidIsbn10, isValidIsbn13, normalizeIsbn } from '../../../shared/isbn'
import { fetchJson, NetError } from '../net'
import { cleanTitle, isoDateFrom, languageName, plainText, yearFrom } from './text'

const BASE = 'https://www.googleapis.com/books/v1/volumes'

export interface GoogleVolume {
  id: string
  volumeInfo?: {
    title?: string
    subtitle?: string
    authors?: string[]
    publisher?: string
    publishedDate?: string
    description?: string
    industryIdentifiers?: { type: string; identifier: string }[]
    pageCount?: number
    categories?: string[]
    averageRating?: number
    ratingsCount?: number
    language?: string
    imageLinks?: { thumbnail?: string; small?: string; medium?: string; large?: string }
    infoLink?: string
    canonicalVolumeLink?: string
  }
}

export interface GoogleFields {
  title: string
  subtitle: string | null
  authors: string[]
  publisher: string | null
  pubDate: string | null
  description: string | null
  isbn13: string | null
  isbn10: string | null
  pages: number | null
  categories: string[]
  ratingAvg: number | null
  ratingCount: number | null
  language: string | null
  coverUrl: string | null
  link: string | null
}

/** Google gives small "thumbnail" images over http; ask for a larger one over https. */
function coverFrom(links: NonNullable<GoogleVolume['volumeInfo']>['imageLinks']): string | null {
  const url = links?.large ?? links?.medium ?? links?.small ?? links?.thumbnail
  if (!url) return null
  return url.replace(/^http:/, 'https:').replace('&edge=curl', '').replace(/zoom=\d/, 'zoom=1')
}

export function mapVolume(v: GoogleVolume): GoogleFields | null {
  const info = v.volumeInfo
  const title = cleanTitle(info?.title)
  if (!info || !title) return null
  const ids = info.industryIdentifiers ?? []
  const isbn13 = ids.find((i) => i.type === 'ISBN_13' && isValidIsbn13(i.identifier))?.identifier ?? null
  const isbn10 = ids.find((i) => i.type === 'ISBN_10' && isValidIsbn10(i.identifier))?.identifier ?? null
  // Categories look like "Fiction / Fantasy / General": keep the useful parts.
  const categories = (info.categories ?? [])
    .flatMap((c) => c.split('/'))
    .map((c) => c.trim())
    .filter((c) => c && c.toLowerCase() !== 'general')
    .filter((c, i, all) => all.indexOf(c) === i)
    .slice(0, 5)
  return {
    title,
    subtitle: cleanTitle(info.subtitle),
    authors: info.authors ?? [],
    publisher: cleanTitle(info.publisher),
    pubDate: isoDateFrom(info.publishedDate),
    description: plainText(info.description),
    isbn13: isbn13 ? normalizeIsbn(isbn13) : null,
    isbn10: isbn10 ? normalizeIsbn(isbn10) : null,
    pages: info.pageCount && info.pageCount > 0 ? info.pageCount : null,
    categories,
    ratingAvg: info.averageRating ?? null,
    ratingCount: info.ratingsCount ?? null,
    language: languageName(info.language),
    coverUrl: coverFrom(info.imageLinks),
    link: info.canonicalVolumeLink ?? info.infoLink?.replace(/^http:/, 'https:') ?? null
  }
}

export function mapVolumeResult(v: GoogleVolume): CatalogResult | null {
  const f = mapVolume(v)
  if (!f) return null
  return {
    ref: { googleId: v.id, isbn: f.isbn13 ?? f.isbn10 ?? undefined },
    title: f.title,
    subtitle: f.subtitle,
    authors: f.authors,
    firstPublishYear: yearFrom(f.pubDate),
    editionCount: null,
    pages: f.pages,
    coverUrl: f.coverUrl,
    sources: ['google'],
    inLibraryId: null
  }
}

const withKey = (url: string, apiKey: string | null): string => (apiKey ? `${url}&key=${encodeURIComponent(apiKey)}` : url)

// Without a key Google often answers "too many requests". After that, skip it for a while
// instead of asking again on every search (adding a key in Settings lifts this at once).
const QUIET_MS = 10 * 60_000
let quietUntil = 0

async function googleJson<T>(url: string, apiKey: string | null): Promise<T> {
  if (!apiKey && Date.now() < quietUntil) throw new NetError('quota', 'Google Books is resting after too many requests')
  try {
    return await fetchJson<T>(withKey(url, apiKey))
  } catch (err) {
    if (err instanceof NetError && err.kind === 'quota' && !apiKey) quietUntil = Date.now() + QUIET_MS
    throw err
  }
}

/** For tests: forget any earlier refusal. */
export function resetGoogleQuiet(): void {
  quietUntil = 0
}

export async function searchGoogle(q: string, apiKey: string | null): Promise<CatalogResult[]> {
  const isbn = normalizeIsbn(q)
  const query = isValidIsbn10(isbn) || isValidIsbn13(isbn) ? `isbn:${isbn}` : q
  const data = await googleJson<{ items?: GoogleVolume[] }>(`${BASE}?q=${encodeURIComponent(query)}&maxResults=20&printType=books`, apiKey)
  return (data.items ?? []).map(mapVolumeResult).filter((r): r is CatalogResult => r !== null)
}

export async function getVolume(id: string, apiKey: string | null): Promise<GoogleVolume> {
  return googleJson<GoogleVolume>(`${BASE}/${encodeURIComponent(id)}?projection=full`, apiKey)
}

export async function findVolumeByIsbn(isbn: string, apiKey: string | null): Promise<GoogleVolume | null> {
  const data = await googleJson<{ items?: GoogleVolume[] }>(`${BASE}?q=isbn:${encodeURIComponent(isbn)}&maxResults=1`, apiKey)
  return data.items?.[0] ?? null
}
