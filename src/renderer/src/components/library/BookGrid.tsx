import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { BookSummary } from '../../../../shared/books'
import { READING_LABELS } from '../../../../shared/books'
import { useScrollElement } from '../../app/AppShell'
import { BookCover } from './BookCover'
import { useBookTilt } from '../../hooks/useBookTilt'

const MIN_TILE = 150
const GAP = 28
const TEXT_HEIGHT = 76

interface BookGridProps {
  books: BookSummary[]
  total: number
  onNeedMore: () => void
}

function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ref])
  return width
}

/** Covers in rows. Only the rows on screen are drawn, so thousands of books stay smooth. */
export function BookGrid({ books, total, onNeedMore }: BookGridProps) {
  const scrollRef = useScrollElement()
  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref)
  useBookTilt(ref)
  const columns = Math.max(2, Math.floor((width + GAP) / (MIN_TILE + GAP)))
  const tileWidth = width > 0 ? (width - GAP * (columns - 1)) / columns : MIN_TILE
  const rowHeight = tileWidth * 1.5 + TEXT_HEIGHT + GAP
  const rowCount = Math.ceil(total / columns)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
    scrollMargin: ref.current?.offsetTop ?? 0
  })

  useEffect(() => virtualizer.measure(), [rowHeight, virtualizer])

  const rows = virtualizer.getVirtualItems()
  const lastRow = rows[rows.length - 1]?.index ?? 0
  useEffect(() => {
    if ((lastRow + 3) * columns >= books.length && books.length < total) onNeedMore()
  }, [lastRow, columns, books.length, total, onNeedMore])

  return (
    <div ref={ref} style={{ height: virtualizer.getTotalSize(), position: 'relative' }} data-testid="book-grid">
      {rows.map((row) => (
        <div
          key={row.key}
          className="book-row absolute left-0 grid w-full"
          style={{
            top: row.start - virtualizer.options.scrollMargin,
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            columnGap: GAP
          }}
        >
          {Array.from({ length: columns }, (_, c) => {
            const index = row.index * columns + c
            if (index >= total) return <div key={c} />
            const book = books[index]
            return book ? <Tile key={book.id} book={book} /> : <SkeletonTile key={`s${index}`} />
          })}
        </div>
      ))}
    </div>
  )
}

function Tile({ book }: { book: BookSummary }) {
  const author = book.authors.join(', ')
  return (
    <Link to={`/book/${book.id}`} className="book-tile" title={`${book.title}${author ? ` by ${author}` : ''}`}>
      <div className="book-stage">
        <div className="book">
          <BookCover book={book} />
          <span className="book-glare" aria-hidden="true" />
        </div>
        <span className="book-shadow" aria-hidden="true" />
      </div>
      <div className="mt-2.5 h-[62px] overflow-hidden">
        <div className="truncate text-[14px] font-medium text-ink">{book.title}</div>
        <div className="truncate text-[13px] text-muted">{author || ' '}</div>
        {book.readingStatus && (
          <div className="mt-0.5 truncate text-[11px] uppercase leading-4 tracking-[0.06em] text-muted/80">
            {READING_LABELS[book.readingStatus]}
          </div>
        )}
      </div>
    </Link>
  )
}

function SkeletonTile() {
  return (
    <div>
      <div className="aspect-[2/3] animate-pulse rounded-[4px] bg-border/60" />
      <div className="mt-2.5 h-3 w-3/4 animate-pulse rounded bg-border/60" />
    </div>
  )
}
