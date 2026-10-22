import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import {
  ArrowLeftIcon,
  BookOpenTextIcon,
  CaretLeftIcon,
  CaretRightIcon,
  InfoIcon,
  PencilSimpleIcon,
  TrashIcon
} from '@phosphor-icons/react'
import type { BookDetail } from '../../../shared/books'
import { ROLE_LABELS } from '../../../shared/books'
import { refreshBooks, useBook, useOrderedIds } from '../lib/queries'
import { sortFor, useLibrary } from '../stores/library'
import { Button } from '../components/PageHeader'
import { CoverEditor } from '../components/book/CoverEditor'
import { YourBookView } from '../components/book/YourBookView'
import { BookInfoView } from '../components/book/BookInfoView'
import { clothColour } from '../components/library/PlaceholderCover'
import { BookCover } from '../components/library/BookCover'
import { BurnAway } from '../components/book/BurnAway'
import { formatDate } from '../components/ui'

/** The cover as a picture the fire can burn: the saved image, or the made-up cloth cover drawn here. */
async function coverTexture(book: BookDetail): Promise<ImageBitmap | HTMLCanvasElement> {
  if (book.coverPath) {
    const bytes = await window.api.books.coverBytes(book.id)
    if (bytes) return createImageBitmap(new Blob([new Uint8Array(bytes)]))
  }
  const canvas = document.createElement('canvas')
  canvas.width = 520
  canvas.height = 780
  const ctx = canvas.getContext('2d')!
  const cssVar = clothColour(book.title).match(/--[\w-]+/)?.[0] ?? '--cloth-1'
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim() || '#2f5d50'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'rgb(0 0 0 / 0.15)'
  ctx.fillRect(0, 0, 32, canvas.height)
  ctx.fillStyle = '#fbf8f2'
  ctx.font = '600 48px Georgia, serif'
  const words = book.title.split(' ')
  let line = ''
  let y = 110
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width > canvas.width - 110 && line) {
      ctx.fillText(line, 60, y)
      line = w
      y += 58
    } else line = next
  }
  ctx.fillText(line, 60, y)
  return canvas
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

export function BookDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: book, isLoading } = useBook(id)
  // A book opens on your own page (your rating, reading, thoughts…); "Book info" shows everything about it.
  const [view, setView] = useState<'mine' | 'info'>('mine')
  const [burning, setBurning] = useState(false)

  // Previous / next follow the list you came from (Library or a shelf) in its current order.
  const shelf = useLibrary((s) => s.lastShelf)
  const storedSort = useLibrary((s) => s.sort)
  const storedDir = useLibrary((s) => s.dir)
  const { data: ids = [] } = useOrderedIds({ shelf, ...sortFor(shelf, storedSort, storedDir) })
  const index = id ? ids.indexOf(id) : -1
  const prevId = index > 0 ? ids[index - 1] : undefined
  const nextId = index >= 0 && index < ids.length - 1 ? ids[index + 1] : undefined

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTyping(e.target) || e.ctrlKey || e.altKey || e.metaKey) return
      if (e.key === 'ArrowLeft' && prevId) navigate(`/book/${prevId}`, { replace: true })
      if (e.key === 'ArrowRight' && nextId) navigate(`/book/${nextId}`, { replace: true })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prevId, nextId, navigate])

  useEffect(() => setView('mine'), [id])

  if (isLoading) return <p className="text-muted">Loading&hellip;</p>
  if (!book) {
    return (
      <p className="text-muted">
        That book isn&rsquo;t in your library any more. <Link to="/library" className="text-accent">Back to the library</Link>
      </p>
    )
  }

  // Delete: the cover goes up in flames first; once it has burnt away the book leaves the library.
  const remove = async (): Promise<void> => {
    await window.api.books.remove(book.id)
    navigate(-1)
    await refreshBooks()
    toast(`“${book.title}” went up in flames`, {
      duration: 8000,
      action: {
        label: 'Undo',
        onClick: async () => {
          await window.api.books.restore(book.id)
          await refreshBooks()
          toast.success('Book restored')
        }
      }
    })
  }

  const authors = book.contributors.filter((c) => c.role === 'author').map((c) => c.name)
  const others = book.contributors.filter((c) => c.role !== 'author')

  return (
    <div className="relative">
      {/* A soft wash of the book's colour behind the header. */}
      <div
        className="pointer-events-none absolute -inset-x-10 -top-10 h-72 opacity-[0.14]"
        style={{ background: `linear-gradient(to bottom, ${clothColour(book.title)}, transparent)` }}
        aria-hidden="true"
      />

      <div className="relative mb-8 flex items-center justify-between">
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-2 text-[14px] text-muted hover:text-ink">
          <ArrowLeftIcon size={16} /> Back
        </button>
        <div className="flex items-center gap-2">
          <NavButton label="Previous book (←)" disabled={!prevId} onClick={() => navigate(`/book/${prevId}`, { replace: true })}>
            <CaretLeftIcon size={16} />
          </NavButton>
          <NavButton label="Next book (→)" disabled={!nextId} onClick={() => navigate(`/book/${nextId}`, { replace: true })}>
            <CaretRightIcon size={16} />
          </NavButton>
          <Button onClick={() => setView(view === 'mine' ? 'info' : 'mine')} disabled={burning}>
            {view === 'mine' ? (
              <>
                <InfoIcon size={16} weight="bold" /> Book info
              </>
            ) : (
              <>
                <BookOpenTextIcon size={16} /> My book
              </>
            )}
          </Button>
          <Button variant="secondary" onClick={() => navigate(`/book/${book.id}/edit`)}>
            <PencilSimpleIcon size={16} /> Edit
          </Button>
          <Button variant="secondary" onClick={() => setBurning(true)} disabled={burning} className="hover:text-danger">
            <TrashIcon size={16} /> Delete
          </Button>
        </div>
      </div>

      <div className="relative grid gap-10 md:grid-cols-[260px_1fr]">
        <div>
          <CoverEditor bookId={book.id} title={book.title} hasCover={!!book.coverPath} disabled={burning}>
            <BurnAway burning={burning} onBurnt={remove} loadTexture={() => coverTexture(book)}>
              <BookCover book={book} size="lg" />
            </BurnAway>
          </CoverEditor>
          <div className="mt-4 text-[13px] text-muted">Added {formatDate(book.createdAt)}</div>
        </div>

        <div className={`min-w-0 transition-opacity duration-700 ${burning ? 'opacity-30' : ''}`}>
          <h1 className="m-0 font-display text-[44px] font-semibold leading-[1.05] tracking-tight">{book.title}</h1>
          {book.subtitle && <p className="mt-2 mb-0 font-display text-xl text-muted">{book.subtitle}</p>}
          <p className="mt-3 mb-0 text-lg">{authors.length ? authors.join(', ') : <span className="text-muted">Unknown author</span>}</p>
          {others.length > 0 && (
            <p className="mt-1 mb-0 text-[14px] text-muted">
              {others.map((c) => `${ROLE_LABELS[c.role]}: ${c.name}`).join(' · ')}
            </p>
          )}
          <div className="mt-6">{view === 'mine' ? <YourBookView book={book} /> : <BookInfoView book={book} />}</div>
        </div>
      </div>
    </div>
  )
}

function NavButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-10 place-items-center rounded-lg border border-border bg-surface text-muted hover:text-ink disabled:opacity-40"
    >
      {children}
    </button>
  )
}
