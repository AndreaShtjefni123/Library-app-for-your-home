import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BookOpenIcon, HourglassIcon, TrashIcon } from '@phosphor-icons/react'
import type { BookDetail } from '../../../../shared/books'
import { refreshBooks } from '../../lib/queries'
import { Button } from '../PageHeader'
import { fieldClass, formatDate } from '../ui'

/**
 * "How far are you?" — logs a page (or a % when the book's page count isn't known).
 * Reaching the end offers to mark the book as read.
 */
export function LogProgress({ book, onDone }: { book: BookDetail; onDone: () => void }) {
  const byPage = book.pages !== null
  const [value, setValue] = useState(byPage ? (book.currentPage?.toString() ?? '') : (book.progressPercent?.toString() ?? ''))
  const [error, setError] = useState<string>()
  const [finished, setFinished] = useState(false)

  const save = async (): Promise<void> => {
    const n = Number(value)
    if (value.trim() === '' || Number.isNaN(n) || n < 0) return setError(byPage ? 'Enter the page you’re on' : 'Enter a percentage')
    if (byPage && (!Number.isInteger(n) || n > book.pages!)) return setError(`Enter a page between 0 and ${book.pages}`)
    if (!byPage && n > 100) return setError('Enter a percentage up to 100')
    setError(undefined)
    const pct = await window.api.mine.logProgress(book.id, byPage ? n : null, byPage ? null : n)
    await refreshBooks()
    if (pct !== null && pct >= 100) setFinished(true)
    else {
      toast.success(byPage ? `Page ${n} noted` : `${n}% noted`)
      onDone()
    }
  }

  const markRead = async (): Promise<void> => {
    await window.api.shelves.setReading({ id: book.id, status: 'read' })
    await refreshBooks()
    toast.success(`Finished “${book.title}” — nice!`)
    onDone()
  }

  if (finished) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/40 bg-success/10 p-4" role="status">
        <span className="text-[14px] font-medium">That&rsquo;s the last page! Mark it as read?</span>
        <Button onClick={markRead}>Mark as read</Button>
        <Button variant="secondary" onClick={onDone}>
          Not yet
        </Button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-bg p-4"
      aria-label="Log reading progress"
    >
      <label className="block">
        <span className="mb-1 block text-[13px] font-medium">{byPage ? `Page you’re on (of ${book.pages})` : 'How far (%)'}</span>
        <input className={`${fieldClass} !w-40`} type="number" min="0" max={byPage ? book.pages! : 100} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      </label>
      <Button type="submit">Save</Button>
      <Button variant="secondary" onClick={onDone}>
        Cancel
      </Button>
      {error && (
        <p role="alert" className="m-0 w-full text-[13px] text-danger">
          {error}
        </p>
      )}
    </form>
  )
}

/** Every time you logged how far you'd got, newest first, plus when you started and finished. */
export function ReadingLogTab({ book, showLogButton = true }: { book: BookDetail; showLogButton?: boolean }) {
  const [logging, setLogging] = useState(false)
  const log = useQuery({ queryKey: ['books', 'progress', book.id], queryFn: () => window.api.mine.progress(book.id) })
  const entries = log.data ?? []

  const remove = async (id: string): Promise<void> => {
    await window.api.mine.deleteProgress(id)
    await refreshBooks()
  }

  return (
    <div className="grid max-w-2xl gap-5">
      {!showLogButton ? null : logging ? (
        <LogProgress book={book} onDone={() => setLogging(false)} />
      ) : (
        <div>
          <Button onClick={() => setLogging(true)}>
            <BookOpenIcon size={16} /> Log progress
          </Button>
        </div>
      )}
      <ol className="m-0 grid list-none gap-0 p-0" data-testid="reading-log">
        {book.finishedAt && <LogRow date={book.finishedAt} text="Finished ✔" />}
        {entries.map((e) => (
          <LogRow
            key={e.id}
            date={e.loggedAt}
            text={
              e.page !== null
                ? `Reached page ${e.page}${book.pages ? ` of ${book.pages}` : ''}${e.percent !== null ? ` · ${Math.round(e.percent)}%` : ''}`
                : `Reached ${Math.round(e.percent ?? 0)}%`
            }
            onDelete={() => remove(e.id)}
          />
        ))}
        {book.startedAt && <LogRow date={book.startedAt} text="Started" />}
      </ol>
      {!entries.length && !book.startedAt && (
        <p className="m-0 flex items-center gap-2 text-[14px] text-muted">
          <HourglassIcon size={18} /> Nothing logged yet. Each time you read, note the page you reached.
        </p>
      )}
    </div>
  )
}

function LogRow({ date, text, onDelete }: { date: string; text: string; onDelete?: () => void }) {
  return (
    <li className="group flex items-center gap-4 border-l-2 border-border py-2 pl-4">
      <span className="w-28 shrink-0 text-[13px] tabular-nums text-muted">{formatDate(date)}</span>
      <span className="flex-1 text-[14px]">{text}</span>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete this entry"
          className="rounded-md p-1 text-muted opacity-0 transition group-hover:opacity-100 hover:text-danger focus:opacity-100"
        >
          <TrashIcon size={14} />
        </button>
      )}
    </li>
  )
}

const DAY = 86_400_000

/**
 * "Haven't read this in a while?" — after some days without progress on a book you're reading,
 * gently suggest moving it to Partly read. You can put it off or turn it off for this book.
 */
export function StaleSuggestion({ book, onMove }: { book: BookDetail; onMove: () => void }) {
  const days = useQuery({ queryKey: ['settings', 'suggest-days'], queryFn: () => window.api.mine.suggestDays() })
  if (book.readingStatus !== 'reading' || !days.data) return null
  const last = book.lastReadAt ?? book.readingUpdatedAt ?? (book.startedAt ? `${book.startedAt}T00:00:00` : null)
  if (!last) return null
  const idle = Math.floor((Date.now() - new Date(last).getTime()) / DAY)
  const snoozed = book.suggestSnoozedUntil && new Date(book.suggestSnoozedUntil).getTime() > Date.now()
  if (idle < days.data || snoozed) return null

  const snooze = async (d: number | null): Promise<void> => {
    await window.api.mine.snooze(book.id, d)
    await refreshBooks()
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-gilt/12 px-4 py-3" role="status" data-testid="stale-suggestion">
      <HourglassIcon size={18} className="text-gilt" />
      <span className="flex-1 text-[14px]">
        No progress in {idle} days. Move it to <strong>Partly read</strong>?
      </span>
      <Button className="h-8 px-3 text-[13px]" onClick={onMove}>
        Move
      </Button>
      <Button variant="secondary" className="h-8 px-3 text-[13px]" onClick={() => snooze(14)}>
        Still reading
      </Button>
      <button type="button" className="text-[12px] text-muted hover:text-ink hover:underline" onClick={() => snooze(null)}>
        Don&rsquo;t ask for this book
      </button>
    </div>
  )
}
