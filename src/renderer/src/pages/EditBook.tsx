import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import type { DuplicateCandidate, ReadingStatus, Shelf } from '../../../shared/books'
import { SHELF_READING } from '../../../shared/books'
import { PageHeader } from '../components/PageHeader'
import { BookForm, type BookFormValues } from '../components/book/BookForm'
import { DuplicateDialog } from '../components/book/DuplicateDialog'
import { refreshBooks, useBook } from '../lib/queries'

/** Presets when adding from a shelf page, e.g. "Add book" on To-read pile. */
function shelfPreset(shelf: string | null): { ownership?: 'owned' | 'wishlist'; readingStatus?: ReadingStatus } {
  if (shelf === 'want-to-buy') return { ownership: 'wishlist' }
  const reading = shelf ? SHELF_READING[shelf as Shelf] : undefined
  return reading ? { ownership: 'owned', readingStatus: reading } : {}
}

export function AddBookPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ values: BookFormValues; candidates: DuplicateCandidate[] }>()

  const create = async (values: BookFormValues): Promise<void> => {
    setBusy(true)
    try {
      const id = await window.api.books.create(values)
      await refreshBooks()
      toast.success(`Added “${values.title}”`)
      navigate(`/book/${id}`)
    } catch (e) {
      toast.error(`Couldn’t save: ${(e as Error).message}`)
      setBusy(false)
    }
  }

  const submit = async (values: BookFormValues): Promise<void> => {
    setBusy(true)
    const candidates = await window.api.books.duplicates(values)
    if (candidates.length) {
      setPending({ values, candidates })
      setBusy(false)
      return
    }
    await create(values)
  }

  const anotherCopy = async (id: string): Promise<void> => {
    setPending(undefined)
    await window.api.books.addCopy(id)
    await refreshBooks()
    toast.success('Added another copy')
    navigate(`/book/${id}`)
  }

  return (
    <>
      <PageHeader
        title="Add a book"
        subtitle="For the rare book that can't be found online: type in the details yourself."
      />
      <BookForm
        mode="add"
        defaultValues={{
          ...shelfPreset(params.get('shelf')),
          ...(params.get('title') ? { title: params.get('title')! } : {}),
          ...(params.get('isbn') ? { isbn: params.get('isbn')! } : {})
        }}
        busy={busy}
        onSubmit={submit}
        onCancel={() => navigate(-1)}
      />
      {pending && (
        <DuplicateDialog
          candidates={pending.candidates}
          onAnotherCopy={anotherCopy}
          onDifferentEdition={() => {
            const { values } = pending
            setPending(undefined)
            create(values)
          }}
          onCancel={() => setPending(undefined)}
        />
      )}
    </>
  )
}

export function EditBookPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: book, isLoading } = useBook(id)
  const [busy, setBusy] = useState(false)

  if (isLoading) return <p className="text-muted">Loading&hellip;</p>
  if (!book) return <p className="text-muted">That book isn&rsquo;t in your library any more.</p>

  const save = async (values: BookFormValues): Promise<void> => {
    setBusy(true)
    try {
      const { ownership: _o, readingStatus: _r, ...details } = values
      await window.api.books.update(book.id, details)
      await refreshBooks()
      toast.success('Changes saved')
      navigate(`/book/${book.id}`)
    } catch (e) {
      toast.error(`Couldn’t save: ${(e as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Edit book" subtitle={book.title} />
      <BookForm
        mode="edit"
        busy={busy}
        onSubmit={save}
        onCancel={() => navigate(-1)}
        defaultValues={{
          title: book.title,
          subtitle: book.subtitle ?? '',
          contributors: book.contributors.length ? book.contributors : [{ name: '', role: 'author' }],
          publisher: book.publisher ?? '',
          pubDate: book.pubDate ?? '',
          pages: book.pages ?? undefined,
          isbn: book.isbn13 ?? book.isbn10 ?? '',
          format: book.format ?? undefined,
          language: book.language ?? '',
          description: book.description ?? '',
          seriesName: book.series?.name ?? '',
          seriesNumber: book.series?.number ?? undefined,
          ownership: book.ownership
        }}
      />
    </>
  )
}
