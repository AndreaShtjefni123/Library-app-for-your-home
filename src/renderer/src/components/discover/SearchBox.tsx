import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CircleNotchIcon, MagnifyingGlassIcon, WifiSlashIcon } from '@phosphor-icons/react'
import type { CatalogResult, LibraryHit } from '../../../../shared/catalog'
import { BookCover, RemoteCover } from '../library/BookCover'
import { fieldClass } from '../ui'
import { InLibraryBadge } from './parts'
import { listCover, prefetchCover, prefetchDetails, rememberResults } from '../../lib/catalog'

const DEBOUNCE_MS = 150
const MIN_CHARS = 2
const MAX_ROWS = 9

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

const sameBook = (a: CatalogResult, b: CatalogResult): boolean =>
  (!!a.ref.olWorkKey && a.ref.olWorkKey === b.ref.olWorkKey) ||
  (a.title.toLowerCase() === b.title.toLowerCase() && (a.authors[0] ?? '') === (b.authors[0] ?? ''))

type Row = { kind: 'library'; hit: LibraryHit } | { kind: 'catalog'; result: CatalogResult }

interface SearchBoxProps {
  value: string
  onChange: (value: string) => void
  /** Enter with nothing highlighted, or "See all results": the full results page. */
  onSearch: (q: string) => void
  /** A suggestion from the online catalogues was chosen: open its preview. */
  onPick: (result: CatalogResult) => void
  /** One of your own books was chosen: open it in your library. */
  onPickLibrary: (id: string) => void
}

/**
 * A search field that suggests books as you type. Matches already on this PC (your books, and
 * books seen in earlier searches) appear instantly; online results join as soon as they arrive.
 */
export function SearchBox({ value, onChange, onSearch, onPick, onPickLibrary }: SearchBoxProps) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const q = useDebounced(value.trim(), DEBOUNCE_MS)
  const typing = value.trim() !== q
  const enabled = q.length >= MIN_CHARS

  const local = useQuery({
    queryKey: ['catalog', 'suggest-local', q.toLowerCase()],
    queryFn: () => window.api.catalog.suggestLocal(q),
    enabled,
    placeholderData: keepPreviousData
  })
  // Two online answers: "quick" (main search only) arrives first, "full" adds the helper search.
  const quick = useQuery({
    queryKey: ['catalog', 'suggest-quick', q.toLowerCase()],
    queryFn: () => window.api.catalog.suggest(q, 'quick'),
    enabled,
    staleTime: 5 * 60_000
  })
  const full = useQuery({
    queryKey: ['catalog', 'suggest', q.toLowerCase()],
    queryFn: () => window.api.catalog.suggest(q, 'full'),
    enabled,
    staleTime: 5 * 60_000
  })

  useEffect(() => inputRef.current?.focus(), [])
  useEffect(() => setActive(-1), [q])

  const online = full.data?.ok ? full.data.data : quick.data?.ok ? quick.data.data : null
  const offline = !!full.data && !full.data.ok && !!quick.data && !quick.data.ok
  const onlineLoading = enabled && (full.isFetching || (quick.isFetching && !online))

  const rows: Row[] = useMemo(() => {
    const library = (local.data?.library ?? []).map((hit): Row => ({ kind: 'library', hit }))
    const libraryIds = new Set((local.data?.library ?? []).map((h) => h.id))
    // Online order wins once it's here; until then, books seen before fill in instantly.
    const fromSeen = local.data?.seen ?? []
    const catalog = online ? [...online, ...fromSeen.filter((s) => !online.some((o) => sameBook(o, s)))] : fromSeen
    const notMine = catalog.filter((c) => !c.inLibraryId || !libraryIds.has(c.inLibraryId))
    return [...library, ...notMine.map((result): Row => ({ kind: 'catalog', result }))].slice(0, MAX_ROWS)
  }, [local.data, online])

  const catalogRows = useMemo(() => rows.flatMap((r) => (r.kind === 'catalog' ? [r.result] : [])), [rows])
  useEffect(() => {
    rememberResults(catalogRows)
    // The top suggestion is the most likely pick: start loading it right away.
    if (catalogRows[0]) {
      prefetchDetails(catalogRows[0].ref)
      prefetchCover(catalogRows[0].coverUrl)
    }
  }, [catalogRows])
  useEffect(() => {
    const row = rows[active]
    if (row?.kind === 'catalog') {
      prefetchDetails(row.result.ref)
      prefetchCover(row.result.coverUrl)
    }
  }, [active, rows])

  const show = open && value.trim().length >= MIN_CHARS
  const rowCount = rows.length + 1 // the last row is always "See all results"

  const choose = (index: number): void => {
    setOpen(false)
    const row = rows[index]
    if (row?.kind === 'library') onPickLibrary(row.hit.id)
    else if (row?.kind === 'catalog') onPick(row.result)
    else if (value.trim()) onSearch(value.trim())
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => (a + 1) % rowCount)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a <= 0 ? rowCount - 1 : a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(show ? active : -1)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const option = (i: number, children: ReactNode, extra = ''): ReactNode => (
    <li
      key={i}
      id={`${listId}-${i}`}
      role="option"
      aria-selected={active === i}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => choose(i)}
      onMouseEnter={() => setActive(i)}
      className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 ${active === i ? 'bg-accent-soft' : ''} ${extra}`}
    >
      {children}
    </li>
  )

  const line = (authors: string[], year: number | null): string => [authors.slice(0, 2).join(', '), year].filter(Boolean).join(' · ')

  return (
    <div className="relative flex-1">
      {(onlineLoading || typing) && value.trim().length >= MIN_CHARS ? (
        <CircleNotchIcon
          size={18}
          className="pointer-events-none absolute top-1/2 left-3.5 z-10 -translate-y-1/2 animate-spin text-accent"
          aria-hidden="true"
        />
      ) : (
        <MagnifyingGlassIcon size={18} className="pointer-events-none absolute top-1/2 left-3.5 z-10 -translate-y-1/2 text-muted" />
      )}
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
        className={`${fieldClass} h-12 pl-11 text-[15px] ${show ? 'rounded-b-none border-accent' : ''}`}
        placeholder="Start typing a title, author or ISBN"
        aria-label="Search for a book"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
      />
      {show && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="absolute inset-x-0 top-full z-40 m-0 max-h-[480px] list-none overflow-y-auto rounded-b-xl border border-t-0 border-accent bg-surface p-1.5 shadow-[0_18px_40px_-14px_rgb(0_0_0/0.35)]"
          data-testid="suggestions"
        >
          {rows.map((row, i) =>
            row.kind === 'library'
              ? option(
                  i,
                  <>
                    <div className="w-9 shrink-0">
                      <BookCover book={row.hit} size="sm" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium">{row.hit.title}</div>
                      <div className="truncate text-[12px] text-muted">{line(row.hit.authors, row.hit.pubYear)}</div>
                    </div>
                    <InLibraryBadge />
                  </>
                )
              : option(
                  i,
                  <>
                    <div className="w-9 shrink-0">
                      <RemoteCover url={listCover(row.result.coverUrl)} title={row.result.title} size="sm" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium">{row.result.title}</div>
                      <div className="truncate text-[12px] text-muted">{line(row.result.authors, row.result.firstPublishYear)}</div>
                    </div>
                    {row.result.inLibraryId && <InLibraryBadge />}
                  </>
                )
          )}
          {rows.length === 0 && (
            <li className="flex items-center gap-2 px-3 py-3 text-[14px] text-muted">
              {offline ? (
                <>
                  <WifiSlashIcon size={16} /> Suggestions need the internet. Press Enter to try a full search.
                </>
              ) : onlineLoading || typing ? (
                <>
                  <CircleNotchIcon size={16} className="animate-spin" /> Looking for books&hellip;
                </>
              ) : (
                'No matching books yet. Keep typing…'
              )}
            </li>
          )}
          {rows.length > 0 && onlineLoading && (
            <li className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-muted" aria-live="polite">
              <CircleNotchIcon size={12} className="animate-spin" /> Finding more online&hellip;
            </li>
          )}
          {option(
            rows.length,
            <span className="flex items-center gap-2 px-1 py-1 text-[14px] font-medium text-accent">
              <MagnifyingGlassIcon size={15} /> See all results for &ldquo;{value.trim()}&rdquo;
            </span>,
            'mt-1 border-t border-border'
          )}
        </ul>
      )}
    </div>
  )
}
