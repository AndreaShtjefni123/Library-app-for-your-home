import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { CheckIcon, CircleNotchIcon, PushPinIcon } from '@phosphor-icons/react'
import type { ShelfPreview } from '../../../../shared/books'
import type { AddTarget, CatalogBook } from '../../../../shared/catalog'
import { ADD_TARGETS, ADD_TARGET_LABELS } from '../../../../shared/catalog'
import { addToLibrary } from '../../lib/catalog'
import { BookCover } from '../library/BookCover'
import { PlaceholderCover } from '../library/PlaceholderCover'

const PANEL_WIDTH = 340
/** Header + five shelf rows; used to decide whether the panel fits below the button. */
const PANEL_HEIGHT = 460
/** Keep clear of the window's title bar. */
const TOP_MARGIN = 48

const HINTS: Record<AddTarget, string> = {
  'to-read': 'Waiting to be read',
  'want-to-buy': 'Not yours yet',
  reading: 'Reading it now',
  read: 'Finished'
}

interface SaveToShelfProps {
  /** Loads the full book (search results only have a summary). */
  getBook: () => Promise<CatalogBook | null>
  title: string
  inLibraryId: string | null
  /** Listed first, e.g. the shelf you came from. */
  suggested?: AddTarget
  size?: 'lg' | 'sm'
  onSaved?: (id: string) => void
}

/**
 * Pinterest-style "Save": opens a panel of your shelves (with their newest covers) and saves the
 * book onto the one you click.
 */
export function SaveToShelf({ getBook, title, inLibraryId, suggested, size = 'lg', onSaved }: SaveToShelfProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<AddTarget | null>(null)
  const [saved, setSaved] = useState<{ id: string; target: AddTarget | null } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const previews = useQuery({
    queryKey: ['books', 'previews'],
    queryFn: () => window.api.shelves.previews(),
    enabled: open
  })

  // Place the panel under the button (or above it when there's no room below), following it on scroll.
  const place = (): void => {
    if (!buttonRef.current) return
    const r = buttonRef.current.getBoundingClientRect()
    const below = r.bottom + 8 + PANEL_HEIGHT < window.innerHeight
    setPos({
      top: below ? r.bottom + 8 : Math.max(TOP_MARGIN, r.top - 8 - PANEL_HEIGHT),
      left: Math.min(Math.max(16, r.left), window.innerWidth - PANEL_WIDTH - 16)
    })
  }
  useLayoutEffect(() => {
    if (open) place()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!panelRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', place)
    document.querySelector('main')?.addEventListener('scroll', place, { passive: true })
    panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', place)
      document.querySelector('main')?.removeEventListener('scroll', place)
    }
  }, [open, previews.isSuccess])

  const save = async (target: AddTarget): Promise<void> => {
    setBusy(target)
    const book = await getBook()
    const id = book ? await addToLibrary(book, target) : null
    setBusy(null)
    if (!id) return
    setSaved({ id, target })
    setOpen(false)
    onSaved?.(id)
  }

  const savedId = saved?.id ?? inLibraryId
  if (savedId) {
    return (
      <Link
        to={`/book/${savedId}`}
        className={`inline-flex items-center gap-1.5 rounded-full bg-accent-soft font-medium text-ink hover:underline ${
          size === 'lg' ? 'h-11 px-5 text-[14px]' : 'h-8 px-3 text-[12px]'
        }`}
        aria-label={`${title} is in your library — open it`}
      >
        <CheckIcon size={size === 'lg' ? 16 : 12} weight="bold" />
        {saved?.target ? `Saved to ${ADD_TARGET_LABELS[saved.target]}` : 'In your library'}
      </Link>
    )
  }

  const order = suggested ? [suggested, ...ADD_TARGETS.filter((t) => t !== suggested)] : [...ADD_TARGETS]
  const byShelf = new Map<string, ShelfPreview>((previews.data ?? []).map((p) => [p.shelf, p]))

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center justify-center gap-2 rounded-full bg-accent font-semibold text-accent-ink shadow-sm transition hover:opacity-90 ${
          size === 'lg' ? 'h-12 w-full px-6 text-[15px]' : 'h-8 px-3.5 text-[13px]'
        }`}
      >
        <PushPinIcon size={size === 'lg' ? 18 : 14} weight="fill" /> Save
      </button>

      {open &&
        createPortal(
        <div
          ref={panelRef}
          role="menu"
          aria-label={`Save “${title}” to a shelf`}
          className="fixed z-50 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_20px_50px_-12px_rgb(0_0_0/0.35)]"
          style={{ top: pos.top, left: pos.left, width: PANEL_WIDTH }}
          data-testid="save-panel"
        >
          <div className="border-b border-border px-5 pt-4 pb-3">
            <div className="text-center font-display text-lg font-semibold">Save to&hellip;</div>
            <div className="truncate text-center text-[12px] text-muted">{title}</div>
          </div>
          <div className="max-h-[calc(100vh-140px)] overflow-y-auto p-2">
            {order.map((t, i) => {
              const preview = byShelf.get(t)
              return (
                <button
                  key={t}
                  type="button"
                  role="menuitem"
                  onClick={() => save(t)}
                  disabled={busy !== null}
                  onKeyDown={(e) => {
                    const items = panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')
                    if (!items) return
                    if (e.key === 'ArrowDown') items[(i + 1) % items.length].focus({ preventScroll: true })
                    if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length].focus({ preventScroll: true })
                  }}
                  className="group flex w-full items-center gap-3 rounded-xl p-2 text-left outline-none hover:bg-bg focus-visible:bg-bg disabled:opacity-60"
                >
                  <ShelfThumbs preview={preview} label={ADD_TARGET_LABELS[t]} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">
                      {ADD_TARGET_LABELS[t]}
                      {t === suggested && <span className="ml-2 text-[11px] font-medium text-muted">suggested</span>}
                    </span>
                    <span className="block truncate text-[12px] text-muted">
                      {preview ? `${preview.count} ${preview.count === 1 ? 'book' : 'books'} · ` : ''}
                      {HINTS[t]}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                    {busy === t ? <CircleNotchIcon size={14} className="animate-spin" /> : 'Save'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>,
          document.body
        )}
    </>
  )
}

/** A little fan of the shelf's newest covers, like a Pinterest board thumbnail. */
function ShelfThumbs({ preview, label }: { preview: ShelfPreview | undefined; label: string }) {
  const books = preview?.recent ?? []
  return (
    <span className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-border/50" aria-hidden="true">
      {books.length === 0 ? (
        <span className="grid size-full place-items-center font-display text-lg font-semibold text-muted">{label[0]}</span>
      ) : (
        <span className="flex size-full gap-px">
          {books.slice(0, books.length === 1 ? 1 : 2).map((b) => (
            <span key={b.id} className="h-full flex-1 overflow-hidden [&>div]:h-full [&>div]:rounded-none [&>div]:shadow-none">
              {b.coverPath ? <BookCover book={b} size="sm" /> : <PlaceholderCover title={b.title} size="sm" />}
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
