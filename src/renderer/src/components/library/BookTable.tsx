import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react'
import type { BookSummary, SortDir, SortKey } from '../../../../shared/books'
import { FORMAT_LABELS, READING_LABELS } from '../../../../shared/books'
import { useScrollElement } from '../../app/AppShell'
import { BookCover } from './BookCover'
import { formatDate } from '../ui'

const ROW = 56
const COLUMNS = '44px minmax(200px,1fr) minmax(140px,220px) 64px 64px 104px 150px 108px'

const HEADERS: { label: string; sort?: SortKey; align?: 'right' }[] = [
  { label: '' },
  { label: 'Title', sort: 'title' },
  { label: 'Author', sort: 'author' },
  { label: 'Year', sort: 'year', align: 'right' },
  { label: 'Pages', sort: 'pages', align: 'right' },
  { label: 'Format', sort: 'format' },
  { label: 'Shelf' },
  { label: 'Added', sort: 'added' }
]

interface BookTableProps {
  books: BookSummary[]
  total: number
  sort: SortKey
  dir: SortDir
  onSort: (sort: SortKey) => void
  onNeedMore: () => void
}

function shelfLabel(b: BookSummary): string {
  if (b.readingStatus) return READING_LABELS[b.readingStatus]
  return b.ownership === 'wishlist' ? 'Want to buy' : ''
}

/** A sortable table. Only the rows on screen are drawn. */
export function BookTable({ books, total, sort, dir, onSort, onNeedMore }: BookTableProps) {
  const scrollRef = useScrollElement()
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const virtualizer = useVirtualizer({
    count: total,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW,
    overscan: 10,
    scrollMargin: ref.current?.offsetTop ?? 0
  })
  const rows = virtualizer.getVirtualItems()
  const last = rows[rows.length - 1]?.index ?? 0
  useEffect(() => {
    if (last + 40 >= books.length && books.length < total) onNeedMore()
  }, [last, books.length, total, onNeedMore])

  return (
    <div role="table" aria-rowcount={total} className="rounded-xl border border-border bg-surface" data-testid="book-table">
      <div
        role="row"
        className="sticky top-0 z-10 grid items-center gap-3 rounded-t-xl border-b border-border bg-surface px-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted"
        style={{ gridTemplateColumns: COLUMNS, height: 40 }}
      >
        {HEADERS.map((h, i) => (
          <div key={i} role="columnheader" aria-sort={h.sort === sort ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
            {h.sort ? (
              <button
                type="button"
                onClick={() => onSort(h.sort!)}
                className={`flex w-full items-center gap-1 uppercase hover:text-ink ${h.align === 'right' ? 'justify-end' : ''} ${
                  h.sort === sort ? 'text-ink' : ''
                }`}
              >
                {h.label}
                {h.sort === sort && (dir === 'asc' ? <CaretUpIcon size={12} weight="bold" /> : <CaretDownIcon size={12} weight="bold" />)}
              </button>
            ) : (
              h.label
            )}
          </div>
        ))}
      </div>
      <div ref={ref} style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {rows.map((row) => {
          const b = books[row.index]
          return (
            <div
              key={row.key}
              role="row"
              tabIndex={b ? 0 : -1}
              onClick={() => b && navigate(`/book/${b.id}`)}
              onKeyDown={(e) => e.key === 'Enter' && b && navigate(`/book/${b.id}`)}
              className={`absolute left-0 grid w-full cursor-pointer items-center gap-3 border-b border-border/60 px-3 text-[14px] hover:bg-bg ${
                row.index % 2 ? 'bg-bg/40' : ''
              }`}
              style={{ top: row.start - virtualizer.options.scrollMargin, height: ROW, gridTemplateColumns: COLUMNS }}
            >
              {b ? (
                <>
                  <div role="cell" className="w-7">
                    <BookCover book={b} size="sm" />
                  </div>
                  <div role="cell" className="min-w-0">
                    <div className="truncate font-medium">{b.title}</div>
                    {b.subtitle && <div className="truncate text-[12px] text-muted">{b.subtitle}</div>}
                  </div>
                  <div role="cell" className="truncate text-muted">{b.authors.join(', ')}</div>
                  <div role="cell" className="text-right tabular-nums text-muted">{b.pubYear ?? ''}</div>
                  <div role="cell" className="text-right tabular-nums text-muted">{b.pages ?? ''}</div>
                  <div role="cell" className="truncate text-muted">{b.format ? FORMAT_LABELS[b.format] : ''}</div>
                  <div role="cell" className="truncate text-muted">{shelfLabel(b)}</div>
                  <div role="cell" className="truncate tabular-nums text-muted">{formatDate(b.createdAt)}</div>
                </>
              ) : (
                <div className="col-span-full h-3 w-1/2 animate-pulse rounded bg-border/60" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
