import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckIcon } from '@phosphor-icons/react'
import type { BookDetail, CopyDetails } from '../../../../shared/books'
import { queryClient, refreshBooks } from '../../lib/queries'
import { StarRating } from '../StarRating'
import { Field, fieldClass } from '../ui'
import { AutoSaveText, Quotes } from './NotesTab'
import { ReadingLogTab, StaleSuggestion } from './Progress'
import { ShelfControls } from './ShelfControls'

const sectionLabel = 'm-0 mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted'

/** The only two formats you can pick for your copy. */
type CopyFormat = 'hardcover' | 'paperback'

/** A small "Saved ✓" that appears after each automatic save. */
function useSaved(): [boolean, () => void] {
  const [saved, setSaved] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  return [
    saved,
    () => {
      setSaved(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setSaved(false), 1500)
    }
  ]
}

/**
 * "Your book": your own side of a book — your rating, where you are in it, when you read it,
 * your thoughts, favourite quotes and reading log. Everything saves by itself.
 */
export function YourBookView({ book }: { book: BookDetail }) {
  return (
    <div className="grid gap-10" data-testid="your-book">
      <section>
        <h3 className={sectionLabel}>Your rating</h3>
        <StarRating
          value={book.rating}
          onChange={async (v) => {
            await window.api.mine.setRating(book.id, v)
            await refreshBooks()
          }}
        />
      </section>

      <StaleSuggestion
        book={book}
        onMove={async () => {
          await window.api.shelves.setReading({
            id: book.id,
            status: 'partly_read',
            currentPage: book.currentPage,
            progressPercent: book.currentPage === null ? book.progressPercent : null
          })
          await refreshBooks()
          toast.success(`“${book.title}” moved to Partly read`)
        }}
      />

      <section>
        <h3 className={sectionLabel}>Reading</h3>
        <ShelfControls book={book} />
      </section>

      {/* Keyed by book so the fields reset when you flip to another book. */}
      <CopyDetailsRow key={book.id} book={book} />

      <section>
        <AutoSaveText
          key={book.id}
          label="My thoughts on this book"
          labelClassName="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted"
          placeholder="What did you think of it?"
          hint="Saves as you type."
          initial={book.review ?? ''}
          rows={6}
          testId="my-thoughts"
          onSave={async (text) => {
            await window.api.mine.setWriting(book.id, 'review', text || null)
            void queryClient.invalidateQueries({ queryKey: ['books', 'one', book.id] })
          }}
        />
      </section>

      <Quotes bookId={book.id} />

      <section>
        <h3 className={sectionLabel}>Reading log</h3>
        <ReadingLogTab book={book} showLogButton={false} />
      </section>
    </div>
  )
}

/** When you started and finished it, when you got your copy, and whether it's hardcover or paperback. */
function CopyDetailsRow({ book }: { book: BookDetail }) {
  const [saved, flashSaved] = useSaved()
  const [started, setStarted] = useState(book.startedAt ?? '')
  const [finished, setFinished] = useState(book.finishedAt ?? '')
  const copies = useQuery({ queryKey: ['books', 'copies', book.id], queryFn: () => window.api.mine.copies(book.id) })
  const copy = book.ownership === 'wishlist' ? undefined : copies.data?.[0]

  const saveDates = async (s: string, f: string): Promise<void> => {
    await window.api.mine.setDates(book.id, s || null, f || null)
    await refreshBooks()
    flashSaved()
  }

  // Nothing to show: not on a reading shelf and no copy to describe.
  if (!book.readingStatus && !copy) return null

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Your copy details</h3>
        <span className={`flex items-center gap-1 text-[12px] text-success transition-opacity ${saved ? 'opacity-100' : 'opacity-0'}`} role="status">
          <CheckIcon size={12} weight="bold" /> Saved
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {book.readingStatus && (
          <>
            <Field label="Started">
              <input
                type="date"
                className={fieldClass}
                value={started}
                onChange={(e) => {
                  setStarted(e.target.value)
                  void saveDates(e.target.value, finished)
                }}
              />
            </Field>
            <Field label="Finished">
              <input
                type="date"
                className={fieldClass}
                value={finished}
                onChange={(e) => {
                  setFinished(e.target.value)
                  void saveDates(started, e.target.value)
                }}
              />
            </Field>
          </>
        )}
        {copy && <CopyFields key={copy.id} copy={copy} onSaved={flashSaved} />}
      </div>
    </section>
  )
}

/** "Bought / received on" and "Format" — both stored on your (first) copy. */
function CopyFields({ copy, onSaved }: { copy: CopyDetails; onSaved: () => void }) {
  const [acquired, setAcquired] = useState(copy.acquiredDate ?? '')
  // Older books may have another format (e.g. ebook); show those as blank here.
  const [format, setFormat] = useState<CopyFormat | ''>(copy.format === 'hardcover' || copy.format === 'paperback' ? copy.format : '')

  const save = async (patch: { acquiredDate: string | null } | { format: CopyFormat | null }): Promise<void> => {
    try {
      await window.api.mine.updateCopy(copy.id, patch)
      void queryClient.invalidateQueries({ queryKey: ['books', 'copies'] })
      await refreshBooks()
      onSaved()
    } catch {
      toast.error('Couldn’t save that change')
    }
  }

  return (
    <>
      <Field label="Bought / received on">
        <input
          type="date"
          className={fieldClass}
          value={acquired}
          onChange={(e) => {
            setAcquired(e.target.value)
            void save({ acquiredDate: e.target.value || null })
          }}
        />
      </Field>
      <Field label="Format">
        <select
          className={fieldClass}
          data-testid="format-select"
          value={format}
          onChange={(e) => {
            const value = e.target.value as CopyFormat | ''
            setFormat(value)
            void save({ format: value || null })
          }}
        >
          <option value="">&mdash;</option>
          <option value="hardcover">Hardcover</option>
          <option value="paperback">Paperback</option>
        </select>
      </Field>
    </>
  )
}
