import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftIcon, ArrowSquareOutIcon, CircleNotchIcon } from '@phosphor-icons/react'
import type { AddTarget, CatalogBook, CatalogEdition } from '../../../shared/catalog'
import { applyEdition } from '../../../shared/catalog'
import { FORMAT_LABELS, ROLE_LABELS } from '../../../shared/books'
import { Button } from '../components/PageHeader'
import { RemoteCover } from '../components/library/BookCover'
import { OnlinePill, Rating } from '../components/discover/parts'
import { SaveToShelf } from '../components/discover/SaveToShelf'
import { detailsQuery, errorText, listCover, refFromSearch, seenResult, targetForShelf } from '../lib/catalog'
import { fieldClass } from '../components/ui'

/** Everything known about a book found online, before (and for) adding it. */
export function DiscoverBookPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const ref = useMemo(() => refFromSearch(params), [params])
  const suggested: AddTarget | undefined = params.get('shelf') ? targetForShelf(params.get('shelf')) : undefined
  const [edition, setEdition] = useState<CatalogEdition | null>(null)
  const [addedId, setAddedId] = useState<string | null>(null)

  const details = useQuery(detailsQuery(ref))

  if (details.isLoading) {
    // Show what we already know (cover, title, author) at once while the rest arrives.
    const quick = seenResult(ref)
    return (
      <div className="grid gap-10 md:grid-cols-[260px_1fr]" aria-busy="true">
        <div>
          {quick && (
            <RemoteCover url={quick.coverUrl} lowUrl={listCover(quick.coverUrl)} title={quick.title} author={quick.authors.join(', ')} size="lg" />
          )}
        </div>
        <div>
          {quick && (
            <>
              <h1 className="m-0 font-display text-[44px] font-semibold leading-[1.05] tracking-tight">{quick.title}</h1>
              <p className="mt-3 mb-0 text-lg">{quick.authors.join(', ')}</p>
            </>
          )}
          <p className="mt-6 flex items-center gap-2 text-muted" role="status">
            <CircleNotchIcon size={18} className="animate-spin" /> Gathering everything about this book&hellip;
          </p>
        </div>
      </div>
    )
  }
  if (!details.data?.ok) {
    return (
      <div className="rounded-xl border border-border bg-surface p-8 text-center" role="alert">
        <p className="mt-0 font-medium">{details.data ? errorText(details.data.error) : 'Something went wrong.'}</p>
        <div className="mt-4 flex justify-center gap-3">
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Back to results
          </Button>
          <Button onClick={() => details.refetch()}>Try again</Button>
        </div>
      </div>
    )
  }

  const base = details.data.data
  const book = edition ? applyEdition(base, edition) : base
  const inLibrary = addedId ?? book.inLibraryId
  const authors = book.contributors.filter((c) => c.role === 'author')

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-2 text-[14px] text-muted hover:text-ink">
          <ArrowLeftIcon size={16} /> Back to results
        </button>
        <OnlinePill />
      </div>

      <div className="grid gap-10 md:grid-cols-[260px_1fr]">
        <div>
          <RemoteCover
            url={book.coverUrl}
            lowUrl={listCover(book.coverUrl)}
            title={book.title}
            author={authors.map((a) => a.name).join(', ')}
            size="lg"
          />
          <div className="mt-6 grid gap-2">
            <SaveToShelf
              getBook={async () => book}
              title={book.title}
              inLibraryId={inLibrary}
              suggested={suggested}
              onSaved={setAddedId}
            />
            <p className="m-0 text-center text-[12px] text-muted">
              {inLibrary
                ? 'Saved on your PC with every detail and the cover.'
                : 'Pick a shelf. Every detail, the cover and author photos are saved to your PC.'}
            </p>
          </div>
        </div>

        <div className="min-w-0">
          <h1 className="m-0 font-display text-[44px] font-semibold leading-[1.05] tracking-tight">{book.title}</h1>
          {book.subtitle && <p className="mt-2 mb-0 font-display text-xl text-muted">{book.subtitle}</p>}
          <p className="mt-3 mb-0 text-lg">{authors.map((a) => a.name).join(', ') || <span className="text-muted">Unknown author</span>}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-muted">
            <Rating avg={book.ratingAvg} count={book.ratingCount} />
            {book.firstPublishedYear && <span>First published {book.firstPublishedYear}</span>}
            {book.editionCount && <span>{book.editionCount} {book.editionCount === 1 ? 'edition' : 'editions'}</span>}
          </div>

          {book.description && (
            <p className="mt-6 mb-0 max-w-prose whitespace-pre-line text-[15px] leading-relaxed">{book.description}</p>
          )}

          {(book.genres.length > 0 || book.subjects.length > 0) && (
            <ul className="mt-6 flex list-none flex-wrap gap-2 p-0" aria-label="Subjects">
              {uniqueTags([...book.genres, ...book.subjects]).slice(0, 18).map((s) => (
                <li key={s} className="rounded-full border border-border bg-surface px-3 py-1 text-[12px] text-muted">
                  {s}
                </li>
              ))}
            </ul>
          )}

          <Section title={edition ? 'This edition' : 'Edition'}>
            <Details book={book} />
          </Section>

          {book.ref.olWorkKey && (
            <EditionsPicker workKey={book.ref.olWorkKey} selected={edition?.key ?? book.ref.olEditionKey} onPick={setEdition} />
          )}

          {book.contributors.some((c) => c.bio || c.photoUrl) && (
            <Section title={book.contributors.length > 1 ? 'About the authors' : 'About the author'}>
              <div className="grid gap-6">
                {book.contributors.map((c) => (
                  <div key={c.name} className="flex gap-4">
                    {c.photoUrl && (
                      <div className="w-20 shrink-0">
                        <RemoteCover url={c.photoUrl} title={c.name} size="sm" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium">
                        {c.name}
                        {c.role !== 'author' && <span className="text-muted"> &middot; {ROLE_LABELS[c.role]}</span>}
                      </div>
                      {(c.birthDate || c.deathDate) && (
                        <div className="text-[13px] text-muted">{[c.birthDate, c.deathDate].filter(Boolean).join(' – ')}</div>
                      )}
                      {c.bio && <p className="mt-2 mb-0 line-clamp-6 text-[14px] leading-relaxed">{c.bio}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {book.links.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-4 text-[14px]">
              {book.links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                  View on {l.label} <ArrowSquareOutIcon size={14} />
                </a>
              ))}
            </div>
          )}
          {inLibrary && (
            <p className="mt-6 text-[14px] text-muted">
              Already saved. <Link to={`/book/${inLibrary}`} className="text-accent hover:underline">Open it in your library</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Genres and subjects often overlap ("Fiction" from both catalogues): show each once. */
function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>()
  return tags.filter((t) => {
    const k = t.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="m-0 mb-4 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">{title}</h2>
      {children}
    </section>
  )
}

function Details({ book }: { book: CatalogBook }) {
  const rows: [string, ReactNode][] = [
    ['Publisher', book.publisher],
    ['Published', book.pubDate],
    ['Pages', book.pages],
    ['Format', book.format && FORMAT_LABELS[book.format]],
    ['Language', book.language],
    ['ISBN-13', book.isbn13],
    ['ISBN-10', book.isbn10],
    ['Series', book.series && `${book.series.name}${book.series.number !== null ? `, book ${book.series.number}` : ''}`],
    ['Other people', book.contributors.filter((c) => c.role !== 'author').map((c) => `${c.name} (${ROLE_LABELS[c.role]})`).join(', ')]
  ]
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== '')
  if (!shown.length) return <p className="m-0 text-muted">No edition details known.</p>
  return (
    <dl className="m-0 grid max-w-lg grid-cols-[120px_1fr] gap-x-6 gap-y-2 text-[14px]">
      {shown.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="m-0 select-text">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function EditionsPicker({
  workKey,
  selected,
  onPick
}: {
  workKey: string
  selected: string | undefined
  onPick: (e: CatalogEdition) => void
}) {
  const [filter, setFilter] = useState('')
  const [showAll, setShowAll] = useState(false)
  const editions = useQuery({
    queryKey: ['catalog', 'editions', workKey],
    queryFn: () => window.api.catalog.editions(workKey),
    staleTime: 10 * 60_000
  })
  const list = editions.data?.ok ? editions.data.data : []
  const f = filter.trim().toLowerCase()
  const filtered = f
    ? list.filter((e) => [e.publisher, e.language, e.pubDate, e.isbn13, e.format, e.subtitle].some((v) => v?.toLowerCase().includes(f)))
    : list
  const visible = showAll ? filtered : filtered.slice(0, 6)

  if (editions.isLoading) return null
  if (!list.length) return null

  return (
    <Section title={`Pick your edition (${list.length})`}>
      <p className="mt-0 mb-3 text-[14px] text-muted">
        Choose the printing you have, so the right publisher, ISBN, pages and cover are saved.
      </p>
      {list.length > 6 && (
        <input
          className={`${fieldClass} mb-3 max-w-sm`}
          placeholder="Filter by publisher, language, year, ISBN…"
          aria-label="Filter editions"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}
      <ul className="m-0 grid list-none gap-2 p-0" data-testid="editions">
        {visible.map((e) => (
          <li key={e.key}>
            <button
              type="button"
              onClick={() => onPick(e)}
              aria-pressed={selected === e.key}
              className={`flex w-full items-center gap-4 rounded-xl border p-3 text-left transition ${
                selected === e.key ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:border-accent/60'
              }`}
            >
              <div className="w-10 shrink-0">
                <RemoteCover url={e.coverUrl} title={e.title} size="sm" />
              </div>
              <div className="min-w-0 flex-1 text-[14px]">
                <div className="truncate font-medium">
                  {e.title}
                  {e.subtitle && <span className="font-normal text-muted"> &mdash; {e.subtitle}</span>}
                </div>
                <div className="truncate text-[13px] text-muted">
                  {[e.publisher, e.pubDate, e.format && FORMAT_LABELS[e.format], e.language, e.pages && `${e.pages} pages`]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <div className="shrink-0 text-[12px] tabular-nums text-muted">{e.isbn13 ?? e.isbn10 ?? 'no ISBN'}</div>
            </button>
          </li>
        ))}
      </ul>
      {filtered.length > 6 && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="mt-3 text-[14px] font-medium text-accent hover:underline">
          {showAll ? 'Show fewer' : `Show all ${filtered.length} editions`}
        </button>
      )}
    </Section>
  )
}
