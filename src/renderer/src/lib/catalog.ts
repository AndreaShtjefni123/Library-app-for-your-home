import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Shelf } from '../../../shared/books'
import type { AddTarget, CatalogBook, CatalogErrorKind, CatalogRef, CatalogResult } from '../../../shared/catalog'
import { ADD_TARGET_LABELS } from '../../../shared/catalog'
import { queryClient, refreshBooks } from './queries'
import { remoteSrc } from '../components/library/BookCover'

/** A result's reference travels in the address bar, so Back returns to the same preview. */
export function refToSearch(ref: CatalogRef): string {
  const p = new URLSearchParams()
  if (ref.olWorkKey) p.set('wk', ref.olWorkKey)
  if (ref.olEditionKey) p.set('ek', ref.olEditionKey)
  if (ref.googleId) p.set('gid', ref.googleId)
  if (ref.isbn) p.set('isbn', ref.isbn)
  if (ref.olAuthorKeys?.length) p.set('ak', ref.olAuthorKeys.join(','))
  return p.toString()
}

export function refFromSearch(p: URLSearchParams): CatalogRef {
  return {
    olWorkKey: p.get('wk') ?? undefined,
    olEditionKey: p.get('ek') ?? undefined,
    googleId: p.get('gid') ?? undefined,
    isbn: p.get('isbn') ?? undefined,
    olAuthorKeys: p.get('ak')?.split(',').filter(Boolean)
  }
}

// ---------- Speed ----------

/** Lists and suggestions use Open Library's medium covers: several times smaller, much faster. */
export function listCover(url: string | null): string | null {
  return url?.replace('-L.jpg', '-M.jpg') ?? null
}

/** One shared definition, so a book's details fetched early (on hover) are reused when it opens. */
export function detailsQuery(ref: CatalogRef) {
  return {
    queryKey: ['catalog', 'details', refToSearch(ref)],
    queryFn: () => window.api.catalog.details(ref),
    staleTime: 10 * 60_000
  }
}

/** Start loading a book's details as soon as the pointer rests on it. */
export function prefetchDetails(ref: CatalogRef): void {
  void queryClient.prefetchQuery(detailsQuery(ref))
}

/** Start downloading a book's full-size cover early, so it's ready when the book opens. */
const warmed = new Set<string>()
export function prefetchCover(url: string | null): void {
  if (!url || warmed.has(url)) return
  warmed.add(url)
  new Image().src = remoteSrc(url)
}

/** Full details for saving (instant if they were already prefetched). */
export async function fetchBook(ref: CatalogRef): Promise<CatalogBook | null> {
  const res = await queryClient.fetchQuery(detailsQuery(ref))
  return res.ok ? res.data : null
}

// Results seen in suggestions / search, so a book's page can show its cover and title instantly.
const seen = new Map<string, CatalogResult>()
export function rememberResults(results: CatalogResult[]): void {
  for (const r of results) seen.set(refToSearch(r.ref), r)
}
export function seenResult(ref: CatalogRef): CatalogResult | undefined {
  return seen.get(refToSearch(ref))
}

/** Which "Add to…" choice to suggest when arriving from a shelf's "Find a book" button. */
export function targetForShelf(shelf: string | null): AddTarget {
  const map: Partial<Record<Shelf, AddTarget>> = {
    'to-read': 'to-read',
    'want-to-buy': 'want-to-buy',
    reading: 'reading',
    read: 'read'
  }
  return (shelf && map[shelf as Shelf]) || 'to-read'
}

export function errorText(error: CatalogErrorKind): string {
  switch (error) {
    case 'offline':
      return 'You’re offline, so online catalogues can’t be searched right now.'
    case 'timeout':
      return 'The catalogues are taking too long to answer. Try again in a moment.'
    case 'quota':
      return 'The catalogue is busy (too many requests). Try again in a minute.'
    case 'not_found':
      return 'That book couldn’t be found online.'
    default:
      return 'Something went wrong talking to the catalogues.'
  }
}

/** Saves a found book onto a shelf, with a friendly message. Returns the book's id in your library. */
export async function addToLibrary(book: CatalogBook, target: AddTarget): Promise<string | null> {
  const res = await window.api.catalog.add(book, target)
  if (!res.ok) {
    toast.error(`Couldn’t add “${book.title}”: ${errorText(res.error)}`)
    return null
  }
  // Refresh the library and any search results / previews, so "In your library" badges update.
  await Promise.all([refreshBooks(), queryClient.invalidateQueries({ queryKey: ['catalog'] })])
  if (res.data.existed) toast(`“${book.title}” is already in your library`)
  else toast.success(`Added “${book.title}” to ${ADD_TARGET_LABELS[target]}`)
  return res.data.id
}

/** Live online/offline state from Windows. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = (): void => setOnline(true)
    const off = (): void => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}
