import { Link } from 'react-router'
import { toast } from 'sonner'
import { HourglassIcon } from '@phosphor-icons/react'
import type { BookSummary } from '../../../../shared/books'
import { refreshBooks, useBookPages } from '../../lib/queries'
import { BookCover } from './BookCover'
import { Button } from '../PageHeader'
import { formatDate, ProgressBar, progressText } from '../ui'

/** Books read half or most of the way: most-read first, with where you stopped. */
export function PartlyReadList() {
  const query = useBookPages({ shelf: 'partly-read', sort: 'progress', dir: 'desc' })
  const books = query.data?.pages.flatMap((p) => p.items) ?? []
  const total = query.data?.pages[0]?.total ?? 0

  if (query.isLoading) return <p className="text-muted">Loading&hellip;</p>
  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted">
        <HourglassIcon size={40} weight="duotone" className="mx-auto mb-3" />
        <p className="m-0">
          Nothing here. When you stop a book part-way, choose &ldquo;Partly read&rdquo; on its page and note where you
          stopped.
        </p>
      </div>
    )
  }

  return (
    <>
      <p className="mt-0 mb-6 text-[14px] text-muted">
        {total} {total === 1 ? 'book' : 'books'} waiting for you, most-read first
      </p>
      <ul className="m-0 grid list-none gap-4 p-0" data-testid="partly-read-list">
        {books.map((b) => (
          <PartlyReadCard key={b.id} book={b} />
        ))}
      </ul>
      {query.hasNextPage && (
        <Button variant="secondary" className="mt-6" onClick={() => query.fetchNextPage()}>
          Show more
        </Button>
      )}
    </>
  )
}

function PartlyReadCard({ book }: { book: BookSummary }) {
  const move = async (status: 'reading' | 'read'): Promise<void> => {
    await window.api.shelves.setReading({ id: book.id, status })
    await refreshBooks()
    toast.success(status === 'reading' ? `“${book.title}” is back in Currently reading` : `Finished “${book.title}” — nice!`)
  }

  return (
    <li className="flex gap-5 rounded-xl border border-border bg-surface p-4">
      <Link to={`/book/${book.id}`} className="w-16 shrink-0" aria-label={`Open ${book.title}`}>
        <BookCover book={book} size="sm" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={`/book/${book.id}`} className="block truncate font-display text-lg font-semibold text-ink hover:underline">
          {book.title}
        </Link>
        <div className="truncate text-[14px] text-muted">{book.authors.join(', ')}</div>
        <div className="mt-3 flex items-center gap-3">
          <div className="max-w-sm flex-1">
            <ProgressBar percent={book.progressPercent ?? 0} label={`${book.title} progress`} />
          </div>
          <span className="text-[13px] tabular-nums text-muted">{progressText(book)}</span>
        </div>
        <div className="mt-2 text-[13px] text-muted">
          {book.lastReadAt && <>Last read {formatDate(book.lastReadAt)}</>}
          {book.pausedNote && (
            <span className="ml-2 italic text-ink/80">&ldquo;{book.pausedNote}&rdquo;</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col justify-center gap-2">
        <Button onClick={() => move('reading')}>Resume</Button>
        <Button variant="secondary" onClick={() => move('read')}>
          Mark as read
        </Button>
      </div>
    </li>
  )
}
