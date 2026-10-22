// Shapes for books found online (Open Library + Google Books). No runtime imports (used by preload).
import type { BookFormat, ContributorRole } from './books'

/** Where a result came from, so details can be fetched again. */
export interface CatalogRef {
  olWorkKey?: string // e.g. "OL20893680W"
  olEditionKey?: string // e.g. "OL29486417M"
  googleId?: string
  isbn?: string
  olAuthorKeys?: string[] // e.g. ["OL1387961A"]
}

/** One row in the search results. */
export interface CatalogResult {
  ref: CatalogRef
  title: string
  subtitle: string | null
  authors: string[]
  firstPublishYear: number | null
  editionCount: number | null
  pages: number | null
  coverUrl: string | null
  sources: ('openlibrary' | 'google')[]
  /** Id of the matching book already in your library, if any. */
  inLibraryId: string | null
}

/** A book from your own library that matches what's being typed. */
export interface LibraryHit {
  id: string
  title: string
  authors: string[]
  pubYear: number | null
  coverPath: string | null
}

/** Instant suggestions from this PC: your books, and books seen in earlier searches. */
export interface LocalSuggestions {
  library: LibraryHit[]
  seen: CatalogResult[]
}

/** 'quick' = answer as soon as the main online search replies; 'full' = also include the helper search. */
export type SuggestMode = 'quick' | 'full'

export type CatalogNotice = 'google_quota' | 'google_unavailable' | 'openlibrary_unavailable' | 'from_cache'

export interface CatalogSearch {
  results: CatalogResult[]
  notices: CatalogNotice[]
}

export interface CatalogPerson {
  name: string
  role: ContributorRole
  bio: string | null
  birthDate: string | null
  deathDate: string | null
  photoUrl: string | null
}

/** One printing of a book (publisher, year, format, ISBN, cover). */
export interface CatalogEdition {
  key: string
  title: string
  subtitle: string | null
  publisher: string | null
  pubDate: string | null
  pages: number | null
  language: string | null
  isbn13: string | null
  isbn10: string | null
  format: BookFormat | null
  coverUrl: string | null
}

/** Everything known about a book, ready to preview and save. */
export interface CatalogBook {
  ref: CatalogRef
  title: string
  subtitle: string | null
  contributors: CatalogPerson[]
  description: string | null
  subjects: string[]
  genres: string[]
  series: { name: string; number: number | null } | null
  publisher: string | null
  pubDate: string | null
  firstPublishedYear: number | null
  pages: number | null
  language: string | null
  isbn13: string | null
  isbn10: string | null
  format: BookFormat | null
  coverUrl: string | null
  ratingAvg: number | null
  ratingCount: number | null
  editionCount: number | null
  links: { label: string; url: string }[]
  sources: ('openlibrary' | 'google')[]
  inLibraryId: string | null
}

/** The quick "add to…" choices on a search result. */
export const ADD_TARGETS = ['to-read', 'reading', 'read', 'want-to-buy'] as const
export type AddTarget = (typeof ADD_TARGETS)[number]
export const ADD_TARGET_LABELS: Record<AddTarget, string> = {
  'to-read': 'To-read pile',
  'want-to-buy': 'Want to buy',
  reading: 'Currently reading',
  read: 'Read'
}

export interface AddResult {
  id: string
  /** True when the book was already in the library (nothing new was created). */
  existed: boolean
}

export type CatalogErrorKind = 'offline' | 'timeout' | 'quota' | 'not_found' | 'http' | 'blocked' | 'unknown'

/** Catalogue calls never throw across to the screen; they say what went wrong. */
export type CatalogResponse<T> = { ok: true; data: T } | { ok: false; error: CatalogErrorKind; message: string }

/** Swaps the edition-specific details (publisher, ISBN, cover…) for the chosen edition. */
export function applyEdition(book: CatalogBook, edition: CatalogEdition): CatalogBook {
  return {
    ...book,
    ref: { ...book.ref, olEditionKey: edition.key, isbn: edition.isbn13 ?? edition.isbn10 ?? undefined },
    subtitle: edition.subtitle ?? book.subtitle,
    publisher: edition.publisher,
    pubDate: edition.pubDate,
    pages: edition.pages ?? book.pages,
    language: edition.language ?? book.language,
    isbn13: edition.isbn13,
    isbn10: edition.isbn10,
    format: edition.format,
    coverUrl: edition.coverUrl ?? book.coverUrl
  }
}
