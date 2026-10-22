import { useState } from 'react'
import { toast } from 'sonner'
import type { BookDetail, Ownership, ReadingStatus } from '../../../../shared/books'
import { READING_LABELS, READING_STATUSES } from '../../../../shared/books'
import { refreshBooks } from '../../lib/queries'
import { Button } from '../PageHeader'
import { Field, fieldClass, formatDate, ProgressBar, progressText, Segmented } from '../ui'
import { LogProgress } from './Progress'

type ReadingChoice = ReadingStatus | 'none'

/** Where the book is in your reading, and whether it's still on your Want to buy list. */
export function ShelfControls({ book }: { book: BookDetail }) {
  const [askPartly, setAskPartly] = useState(false)
  const [logging, setLogging] = useState(false)

  const setOwnership = async (ownership: Ownership): Promise<void> => {
    await window.api.shelves.setOwnership(book.id, ownership)
    await refreshBooks()
    toast.success(ownership === 'owned' ? `\u201c${book.title}\u201d is now in your library` : `Moved to Want to buy`)
  }

  const setReading = async (choice: ReadingChoice): Promise<void> => {
    if (choice === 'partly_read') {
      setAskPartly(true)
      return
    }
    setAskPartly(false)
    await window.api.shelves.setReading({ id: book.id, status: choice === 'none' ? null : choice })
    await refreshBooks()
    if (choice === 'read') toast.success(`Finished “${book.title}” — nice!`)
  }

  const showProgress = (book.readingStatus === 'partly_read' || book.readingStatus === 'reading') && book.progressPercent !== null

  return (
    <div className="grid gap-4">
      {book.ownership === 'wishlist' ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-gilt/12 px-4 py-3">
          <span className="text-[14px] font-medium">On your Want to buy list</span>
          <Button variant="secondary" className="h-8 px-3 text-[13px]" onClick={() => setOwnership('owned')}>
            I bought it &mdash; add to my library
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="w-20 text-[13px] text-muted">Shelf</span>
          <button
            type="button"
            className="text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline"
            onClick={() => setOwnership('wishlist')}
          >
            Move to Want to buy
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-20 text-[13px] text-muted">Reading</span>
        <Segmented<ReadingChoice>
          label="Reading status"
          value={askPartly ? 'partly_read' : (book.readingStatus ?? 'none')}
          options={[
            { value: 'none', label: 'Not started' },
            ...READING_STATUSES.map((s) => ({ value: s, label: READING_LABELS[s] }))
          ]}
          onChange={setReading}
        />
      </div>

      {showProgress && !askPartly && (
        <div className="ml-[92px] max-w-md">
          <ProgressBar percent={book.progressPercent ?? 0} />
          <div className="mt-1.5 text-[13px] text-muted">
            {progressText(book)}
            {book.lastReadAt && <> &middot; last read {formatDate(book.lastReadAt)}</>}
          </div>
          {book.readingStatus === 'partly_read' && (
            <div className="mt-2 flex items-center gap-3">
              {book.pausedNote && <span className="text-[13px] italic">&ldquo;{book.pausedNote}&rdquo;</span>}
              <button type="button" className="text-[13px] font-medium text-accent hover:underline" onClick={() => setAskPartly(true)}>
                Update where I stopped
              </button>
            </div>
          )}
        </div>
      )}

      {askPartly && <PartlyReadForm book={book} onDone={() => setAskPartly(false)} />}

      {(book.readingStatus === 'reading' || book.readingStatus === 'partly_read') && !askPartly && (
        <div className="ml-[92px]">
          {logging ? (
            <LogProgress book={book} onDone={() => setLogging(false)} />
          ) : (
            <Button variant="secondary" className="h-8 px-3 text-[13px]" onClick={() => setLogging(true)}>
              Log progress
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/** "How far did you get?" — shown when moving a book to Partly read. */
function PartlyReadForm({ book, onDone }: { book: BookDetail; onDone: () => void }) {
  const [page, setPage] = useState(book.currentPage?.toString() ?? '')
  const [percent, setPercent] = useState(book.currentPage === null && book.progressPercent !== null ? String(book.progressPercent) : '')
  const [note, setNote] = useState(book.pausedNote ?? '')
  const [error, setError] = useState<string>()

  const save = async (): Promise<void> => {
    const pageNum = page.trim() === '' ? null : Number(page)
    const pctNum = percent.trim() === '' ? null : Number(percent)
    if (pageNum !== null && (!Number.isInteger(pageNum) || pageNum < 0 || (book.pages !== null && pageNum > book.pages))) {
      setError(book.pages ? `Enter a page between 0 and ${book.pages}` : 'Enter a whole page number')
      return
    }
    if (pctNum !== null && (Number.isNaN(pctNum) || pctNum < 0 || pctNum > 100)) {
      setError('Enter a percentage between 0 and 100')
      return
    }
    await window.api.shelves.setReading({
      id: book.id,
      status: 'partly_read',
      currentPage: pageNum,
      progressPercent: pageNum === null ? pctNum : null,
      note: note.trim() || null
    })
    await refreshBooks()
    toast.success(`“${book.title}” moved to Partly read`)
    onDone()
  }

  return (
    <div className="ml-[92px] max-w-lg rounded-xl border border-border bg-bg p-4">
      <p className="mt-0 mb-3 text-[14px] font-medium">How far did you get?</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={book.pages ? `Page (of ${book.pages})` : 'Page'}>
          <input className={fieldClass} type="number" min="0" value={page} onChange={(e) => setPage(e.target.value)} autoFocus />
        </Field>
        <Field label="or percent">
          <input
            className={fieldClass}
            type="number"
            min="0"
            max="100"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            disabled={page.trim() !== ''}
          />
        </Field>
        <Field label="Where I stopped (optional)" className="col-span-2">
          <input className={fieldClass} placeholder="e.g. stopped at chapter 12" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      {error && (
        <p role="alert" className="mt-2 mb-0 text-[13px] text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={save}>Save</Button>
      </div>
    </div>
  )
}
