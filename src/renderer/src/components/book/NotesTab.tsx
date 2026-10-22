import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, PencilSimpleIcon, PlusIcon, QuotesIcon, TrashIcon } from '@phosphor-icons/react'
import type { BookDetail, Quote } from '../../../../shared/books'
import { queryClient, refreshBooks } from '../../lib/queries'
import { Button } from '../PageHeader'
import { Field, fieldClass } from '../ui'

/** A text box that saves itself a moment after you stop typing. */
export function AutoSaveText({
  label,
  hint,
  initial,
  onSave,
  rows = 5,
  labelClassName = 'text-[13px] font-medium',
  placeholder,
  testId
}: {
  label: string
  hint?: string
  initial: string
  onSave: (text: string) => Promise<void>
  rows?: number
  labelClassName?: string
  placeholder?: string
  testId?: string
}) {
  const [text, setText] = useState(initial)
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const latest = useRef(initial)

  const save = async (value: string): Promise<void> => {
    setState('saving')
    await onSave(value)
    setState('saved')
  }
  // If a fresher saved text arrives (e.g. coming back to the book), show it — unless you're mid-edit.
  const shown = useRef(initial)
  useEffect(() => {
    if (latest.current === shown.current && initial !== shown.current) {
      setText(initial)
      latest.current = initial
    }
    shown.current = initial
  }, [initial])

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      if (latest.current !== shown.current) void onSave(latest.current)
    },
    // Only on leaving the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between">
        <span className={labelClassName}>{label}</span>
        <span className="text-[12px] font-normal text-muted" role="status">
          {state === 'saving' ? 'Saving…' : state === 'saved' ? (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckIcon size={12} weight="bold" /> Saved
            </span>
          ) : (
            ''
          )}
        </span>
      </span>
      <textarea
        className={`${fieldClass} h-auto py-2 leading-relaxed`}
        rows={rows}
        placeholder={placeholder}
        data-testid={testId}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          latest.current = e.target.value
          clearTimeout(timer.current)
          timer.current = setTimeout(() => void save(e.target.value), 700)
        }}
      />
      {hint && <span className="mt-1 block text-[12px] text-muted">{hint}</span>}
    </label>
  )
}


/** Your favourite lines from the book: add, edit, reorder and delete them. */
export function Quotes({ bookId }: { bookId: string }) {
  const quotes = useQuery({ queryKey: ['books', 'quotes', bookId], queryFn: () => window.api.mine.quotes(bookId) })
  const [editing, setEditing] = useState<Quote | 'new' | null>(null)
  const list = quotes.data ?? []
  const reload = (): Promise<void> => queryClient.invalidateQueries({ queryKey: ['books', 'quotes', bookId] })

  const move = async (index: number, by: -1 | 1): Promise<void> => {
    const ids = list.map((q) => q.id)
    const [item] = ids.splice(index, 1)
    ids.splice(index + by, 0, item)
    await window.api.mine.orderQuotes(bookId, ids)
    await reload()
  }

  const remove = async (q: Quote): Promise<void> => {
    await window.api.mine.deleteQuote(q.id)
    await reload()
    toast('Quote deleted', {
      action: {
        label: 'Undo',
        onClick: async () => {
          await window.api.mine.saveQuote(bookId, { text: q.text, page: q.page, comment: q.comment })
          await reload()
        }
      }
    })
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Favourite quotes</h3>
        {editing !== 'new' && (
          <Button variant="secondary" className="h-8 px-3 text-[13px]" onClick={() => setEditing('new')}>
            <PlusIcon size={14} weight="bold" /> Add a quote
          </Button>
        )}
      </div>
      {editing === 'new' && <QuoteForm bookId={bookId} onDone={() => setEditing(null)} />}
      {list.length === 0 && editing !== 'new' && (
        <p className="m-0 flex items-center gap-2 text-[14px] text-muted">
          <QuotesIcon size={18} /> No quotes yet. Add lines you want to remember.
        </p>
      )}
      <ol className="m-0 grid list-none gap-3 p-0" data-testid="quotes">
        {list.map((q, i) =>
          editing !== 'new' && editing?.id === q.id ? (
            <li key={q.id}>
              <QuoteForm bookId={bookId} quote={q} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={q.id} className="group flex gap-3 rounded-xl border border-border bg-surface p-4">
              <div className="min-w-0 flex-1">
                <blockquote className="m-0 border-l-2 border-gilt pl-3 font-display text-[16px] leading-relaxed whitespace-pre-line">
                  {q.text}
                </blockquote>
                <div className="mt-2 text-[12px] text-muted">
                  {q.page !== null && <>page {q.page}</>}
                  {q.comment && <span className="ml-2 italic text-ink/80">{q.comment}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-start gap-0.5 opacity-50 transition group-hover:opacity-100 focus-within:opacity-100">
                <IconButton label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUpIcon size={14} />
                </IconButton>
                <IconButton label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDownIcon size={14} />
                </IconButton>
                <IconButton label="Edit quote" onClick={() => setEditing(q)}>
                  <PencilSimpleIcon size={14} />
                </IconButton>
                <IconButton label="Delete quote" onClick={() => remove(q)}>
                  <TrashIcon size={14} />
                </IconButton>
              </div>
            </li>
          )
        )}
      </ol>
    </section>
  )
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-7 place-items-center rounded-md text-muted hover:bg-bg hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function QuoteForm({ bookId, quote, onDone }: { bookId: string; quote?: Quote; onDone: () => void }) {
  const [text, setText] = useState(quote?.text ?? '')
  const [page, setPage] = useState(quote?.page?.toString() ?? '')
  const [comment, setComment] = useState(quote?.comment ?? '')
  const save = async (): Promise<void> => {
    if (!text.trim()) return
    await window.api.mine.saveQuote(bookId, {
      id: quote?.id,
      text,
      page: page.trim() === '' ? null : Math.max(0, Math.floor(Number(page))),
      comment: comment.trim() || null
    })
    await queryClient.invalidateQueries({ queryKey: ['books', 'quotes', bookId] })
    await refreshBooks()
    onDone()
  }
  return (
    <div className="mb-3 grid gap-3 rounded-xl border border-accent/40 bg-bg p-4">
      <Field label="Quote">
        <textarea className={`${fieldClass} h-24 py-2`} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      </Field>
      <div className="grid grid-cols-[100px_1fr] gap-3">
        <Field label="Page">
          <input className={fieldClass} type="number" min="0" value={page} onChange={(e) => setPage(e.target.value)} />
        </Field>
        <Field label="Your comment (optional)">
          <input className={fieldClass} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!text.trim()}>
          {quote ? 'Save quote' : 'Add quote'}
        </Button>
      </div>
    </div>
  )
}
