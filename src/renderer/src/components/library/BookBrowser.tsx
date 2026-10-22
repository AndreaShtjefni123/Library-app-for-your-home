import { useCallback, useEffect } from 'react'
import { Link } from 'react-router'
import { BooksIcon, GridFourIcon, ListIcon } from '@phosphor-icons/react'
import type { Shelf, SortKey } from '../../../../shared/books'
import { SORT_KEYS, SORT_LABELS } from '../../../../shared/books'
import { useBookPages } from '../../lib/queries'
import { DEFAULT_DIR, sortFor, useLibrary } from '../../stores/library'
import { BookGrid } from './BookGrid'
import { BookTable } from './BookTable'
import { fieldClass } from '../ui'
import { AddByHandLink } from './AddByHandLink'

const DIRECTION_WORDS: Record<SortKey, [string, string]> = {
  title: ['A–Z', 'Z–A'],
  author: ['A–Z', 'Z–A'],
  format: ['A–Z', 'Z–A'],
  year: ['oldest first', 'newest first'],
  added: ['oldest first', 'newest first'],
  pages: ['shortest first', 'longest first'],
  progress: ['least read first', 'most read first']
}

/** Toolbar + grid or list of books, for the Library and every shelf. */
export function BookBrowser({ shelf, emptyText }: { shelf?: Shelf; emptyText: string }) {
  const { view, setView, setSort, setLastShelf } = useLibrary()
  const storedSort = useLibrary((s) => s.sort)
  const storedDir = useLibrary((s) => s.dir)
  const { sort, dir } = sortFor(shelf, storedSort, storedDir)
  const query = useBookPages({ shelf, sort, dir })

  useEffect(() => setLastShelf(shelf), [shelf, setLastShelf])

  const books = query.data?.pages.flatMap((p) => p.items) ?? []
  const total = query.data?.pages[0]?.total ?? 0
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const onSortHeader = (key: SortKey): void => {
    if (key === sort) setSort(key, dir === 'asc' ? 'desc' : 'asc')
    else setSort(key, DEFAULT_DIR[key])
  }
  const sortChoices = SORT_KEYS.filter((k) => k !== 'progress' || shelf === 'reading')

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[14px] text-muted" aria-live="polite">
          {query.isLoading ? 'Loading…' : `${total.toLocaleString()} ${total === 1 ? 'book' : 'books'}`}
        </p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-[13px] text-muted">
            Sort
            <select
              className={`${fieldClass} h-9 w-auto pr-8`}
              value={`${sort}:${dir}`}
              onChange={(e) => {
                const [k, d] = e.target.value.split(':') as [SortKey, 'asc' | 'desc']
                setSort(k, d)
              }}
              disabled={shelf === 'partly-read'}
            >
              {sortChoices.flatMap((k) =>
                (['asc', 'desc'] as const).map((d) => (
                  <option key={`${k}:${d}`} value={`${k}:${d}`}>
                    {SORT_LABELS[k]} ({DIRECTION_WORDS[k][d === 'asc' ? 0 : 1]})
                  </option>
                ))
              )}
              {shelf === 'partly-read' && <option value="progress:desc">Most read first</option>}
            </select>
          </label>
          <div role="radiogroup" aria-label="View" className="flex rounded-lg border border-border bg-surface p-0.5">
            {(
              [
                ['grid', 'Grid', GridFourIcon],
                ['list', 'List', ListIcon]
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                aria-label={`${label} view`}
                title={`${label} view`}
                onClick={() => setView(v)}
                className={`grid size-8 place-items-center rounded-md ${view === v ? 'bg-accent-soft text-ink' : 'text-muted hover:text-ink'}`}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {query.isError ? (
        <p className="text-danger">Couldn&rsquo;t load books: {query.error.message}</p>
      ) : !query.isLoading && total === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted">
          <BooksIcon size={40} weight="duotone" className="mx-auto mb-3" />
          <p className="m-0">{emptyText}</p>
          <div className="mt-4 flex flex-col items-center gap-1">
            <Link to={shelf ? `/discover?shelf=${shelf}` : '/discover'} className="font-medium text-accent hover:underline">
              Find a book to add
            </Link>
            <AddByHandLink shelf={shelf} />
          </div>
        </div>
      ) : view === 'grid' ? (
        <BookGrid books={books} total={total} onNeedMore={loadMore} />
      ) : (
        <BookTable books={books} total={total} sort={sort} dir={dir} onSort={onSortHeader} onNeedMore={loadMore} />
      )}
    </>
  )
}
