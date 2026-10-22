import type { CatalogBook, CatalogPerson, CatalogResult } from '../../../shared/catalog'
import { splitIsbn } from '../../../shared/isbn'
import { sortTitle } from '../../../shared/sorting'
import type { GoogleFields } from './googleBooks'
import type { OlEdition, OlWork } from './openLibrary'
import { editionSeries, mapEdition, olCover, workDescription, workSubjects } from './openLibrary'
import { yearFrom } from './text'

/** "The Hobbit" by "J.R.R. Tolkien" and "Hobbit" by "J. R. R. Tolkien" get the same key. */
export function matchKey(title: string, authors: string[]): string {
  const t = sortTitle(title).replace(/[^\p{L}\p{N}]+/gu, '')
  const surname = (authors[0] ?? '').trim().split(/\s+/).pop()?.toLowerCase().replace(/[^\p{L}]+/gu, '') ?? ''
  return `${t}|${surname}`
}

/**
 * Combines both catalogues' results without duplicates. The two lists are interleaved so the best
 * match from each comes first; a Google result for the same book is folded into the Open Library one.
 */
export function mergeResults(ol: CatalogResult[], google: CatalogResult[]): CatalogResult[] {
  const merged: CatalogResult[] = []
  const byKey = new Map<string, CatalogResult>()
  const byIsbn = new Map<string, CatalogResult>()

  const add = (r: CatalogResult): void => {
    const key = matchKey(r.title, r.authors)
    const isbn13 = r.ref.isbn ? splitIsbn(r.ref.isbn)?.isbn13 : undefined
    const existing = byKey.get(key) ?? (isbn13 ? byIsbn.get(isbn13) : undefined)
    if (existing) {
      existing.ref = { ...r.ref, ...existing.ref }
      existing.sources = [...new Set([...existing.sources, ...r.sources])]
      existing.coverUrl ??= r.coverUrl
      existing.pages ??= r.pages
      existing.subtitle ??= r.subtitle
      existing.firstPublishYear =
        existing.firstPublishYear && r.firstPublishYear
          ? Math.min(existing.firstPublishYear, r.firstPublishYear)
          : (existing.firstPublishYear ?? r.firstPublishYear)
      return
    }
    const copy = { ...r, ref: { ...r.ref }, sources: [...r.sources] }
    merged.push(copy)
    byKey.set(key, copy)
    if (isbn13) byIsbn.set(isbn13, copy)
  }

  for (let i = 0; i < Math.max(ol.length, google.length); i++) {
    if (ol[i]) add(ol[i])
    if (google[i]) add(google[i])
  }
  return merged
}

export interface DetailParts {
  work: OlWork | null
  edition: OlEdition | null
  authors: CatalogPerson[]
  ratings: { average?: number; count?: number } | null
  editionCount: number | null
  google: GoogleFields | null
  googleId: string | null
}

const longest = (...texts: (string | null | undefined)[]): string | null =>
  texts.filter((t): t is string => Boolean(t)).sort((a, b) => b.length - a.length)[0] ?? null

/**
 * One complete book from both catalogues. Open Library leads for editions, subjects and authors;
 * Google fills gaps and supplies categories and ratings; the longest description wins.
 */
export function mergeDetails(p: DetailParts): CatalogBook | null {
  const ed = p.edition ? mapEdition(p.edition) : null
  const g = p.google
  const title = ed?.title || p.work?.title || g?.title
  if (!title) return null

  const authorNames = new Set(p.authors.map((a) => a.name.toLowerCase()))
  const extraGoogleAuthors: CatalogPerson[] = (g?.authors ?? [])
    .filter((n) => p.authors.length === 0 && !authorNames.has(n.toLowerCase()))
    .map((name) => ({ name, role: 'author', bio: null, birthDate: null, deathDate: null, photoUrl: null }))

  const workCover = p.work?.covers?.find((c) => c > 0)
  const olRating = p.ratings?.average && p.ratings.count ? p.ratings : null
  const workKey = p.work?.key?.split('/').pop()

  const links: { label: string; url: string }[] = []
  if (workKey) links.push({ label: 'Open Library', url: `https://openlibrary.org/works/${workKey}` })
  if (g?.link) links.push({ label: 'Google Books', url: g.link })

  const isbn13 = ed?.isbn13 ?? g?.isbn13 ?? null
  const workYear = yearFrom(p.work?.first_publish_date)
  const editionYear = yearFrom(ed?.pubDate ?? g?.pubDate)

  return {
    ref: {
      olWorkKey: workKey,
      olEditionKey: ed?.key,
      googleId: p.googleId ?? undefined,
      isbn: isbn13 ?? ed?.isbn10 ?? g?.isbn10 ?? undefined
    },
    title,
    subtitle: ed?.subtitle ?? p.work?.subtitle ?? g?.subtitle ?? null,
    contributors: [...p.authors, ...extraGoogleAuthors],
    description: longest(workDescription(p.work ?? ({} as OlWork)), g?.description),
    subjects: p.work ? workSubjects(p.work) : [],
    genres: g?.categories ?? [],
    series: editionSeries(p.edition),
    publisher: ed?.publisher ?? g?.publisher ?? null,
    pubDate: ed?.pubDate ?? g?.pubDate ?? null,
    firstPublishedYear: [workYear, editionYear].filter((y): y is number => y !== null).sort()[0] ?? null,
    pages: ed?.pages ?? g?.pages ?? null,
    language: ed?.language ?? g?.language ?? null,
    isbn13,
    isbn10: ed?.isbn10 ?? g?.isbn10 ?? (isbn13 ? (splitIsbn(isbn13)?.isbn10 ?? null) : null),
    format: ed?.format ?? null,
    coverUrl: ed?.coverUrl ?? (workCover ? olCover(workCover) : null) ?? g?.coverUrl ?? null,
    ratingAvg: g?.ratingAvg ?? (olRating ? Math.round(olRating.average! * 100) / 100 : null),
    ratingCount: g?.ratingCount ?? olRating?.count ?? null,
    editionCount: p.editionCount,
    links,
    sources: [...(p.work || p.edition ? (['openlibrary'] as const) : []), ...(g ? (['google'] as const) : [])],
    inLibraryId: null
  }
}

// ---------- Suggestions while typing ----------

export const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/**
 * Orders suggestions by how well they match what's been typed so far, treating the last word as
 * unfinished: titles starting with the text first, then titles/authors containing every word.
 * Open Library's own order (popularity) only breaks ties.
 */
export function rankSuggestions(results: CatalogResult[], typed: string, limit: number): CatalogResult[] {
  const q = fold(typed)
  const words = q.split(' ').filter(Boolean)
  if (!words.length) return results.slice(0, limit)

  const has = (haystack: string[], word: string, prefix: boolean): boolean =>
    haystack.some((w) => (prefix ? w.startsWith(word) : w === word))

  const scored = results.map((r, index) => {
    const title = fold(r.title)
    const titleWords = title.split(' ')
    const authorWords = fold(r.authors.join(' ')).split(' ')
    const inTitle = (w: string, i: number): boolean => has(titleWords, w, i === words.length - 1)
    const inAuthor = (w: string, i: number): boolean => has(authorWords, w, i === words.length - 1)
    let score = 0
    if (title.startsWith(q)) score += 100
    else if (words.every(inTitle)) score += 60
    else if (words.every((w, i) => inTitle(w, i) || inAuthor(w, i))) {
      // e.g. "tolkien hob": author + title words → very likely the book meant.
      score += words.some(inTitle) ? 70 : 50
    }
    // Among equals: the shorter title (the book itself, not a guide or collection) and the more popular one.
    score -= Math.min(10, Math.max(0, titleWords.length - words.length) * 0.8)
    score += Math.min(12, Math.log2(1 + (r.editionCount ?? 0)) * 1.5)
    score -= index * 0.05
    return { r, score }
  })
  return scored
    .filter((x) => x.score >= 35)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r)
    .slice(0, limit)
}
