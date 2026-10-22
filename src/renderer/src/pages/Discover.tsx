import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { CircleNotchIcon, PlusIcon, WarningCircleIcon, WifiSlashIcon } from '@phosphor-icons/react'
import type { AddTarget, CatalogNotice, CatalogResult } from '../../../shared/catalog'
import { isValidIsbn } from '../../../shared/isbn'
import { PageHeader, Button } from '../components/PageHeader'
import { RemoteCover } from '../components/library/BookCover'
import { AddByHandLink } from '../components/library/AddByHandLink'
import { OnlinePill } from '../components/discover/parts'
import { SearchBox } from '../components/discover/SearchBox'
import { SaveToShelf } from '../components/discover/SaveToShelf'
import {
  errorText,
  fetchBook,
  listCover,
  prefetchCover,
  prefetchDetails,
  refToSearch,
  rememberResults,
  targetForShelf,
  useOnline
} from '../lib/catalog'

const NOTICES: Record<CatalogNotice, string> = {
  google_quota:
    'Google Books is refusing requests right now (too many requests), so these results are from Open Library only. Adding a free Google key in Settings fixes this.',
  google_unavailable: 'Google Books didn’t answer, so these results are from Open Library only.',
  openlibrary_unavailable: 'Open Library didn’t answer, so these results are from Google Books only.',
  from_cache: ''
}

/** Search Open Library and Google Books, then save books onto your shelves. */
export function DiscoverPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const online = useOnline()
  const q = params.get('q') ?? ''
  const [text, setText] = useState(q)
  // When arriving from a shelf's "Find a book", that shelf is suggested first in "Save to…".
  const suggested: AddTarget | undefined = params.get('shelf') ? targetForShelf(params.get('shelf')) : undefined

  useEffect(() => setText(q), [q])

  const search = useQuery({
    queryKey: ['catalog', 'search', q.toLowerCase()],
    queryFn: () => window.api.catalog.search(q),
    enabled: q.length > 0,
    staleTime: 5 * 60_000
  })

  const runSearch = (next: string): void => {
    const p = new URLSearchParams(params)
    p.set('q', next)
    setParams(p)
  }

  const openBook = (r: CatalogResult): void => {
    const shelf = params.get('shelf')
    navigate(`/discover/book?${refToSearch(r.ref)}${shelf ? `&shelf=${shelf}` : ''}`)
  }

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (text.trim()) runSearch(text.trim())
  }

  const manualLink = `/add?${new URLSearchParams(isValidIsbn(q) ? { isbn: q } : q ? { title: q } : {}).toString()}`
  const response = search.data
  const results = response?.ok ? response.data.results : []
  useEffect(() => rememberResults(results), [results])

  return (
    <>
      <PageHeader
        title="Discover"
        subtitle="Start typing to see matching books. Open one to see everything about it, then save it to a shelf."
        actions={<OnlinePill />}
      />

      <form onSubmit={submit} className="mb-10 flex gap-3" role="search">
        <SearchBox value={text} onChange={setText} onSearch={runSearch} onPick={openBook} onPickLibrary={(id) => navigate(`/book/${id}`)} />
        <Button type="submit" className="h-12 px-6" disabled={!text.trim()}>
          Search
        </Button>
      </form>

      {!q ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted">
          <p className="m-0">
            Try a title (&ldquo;Piranesi&rdquo;), an author (&ldquo;Ursula Le Guin&rdquo;) or an ISBN from the back of a book.
          </p>
          <p className="mt-3 mb-0">
            Can&rsquo;t find a book online? <AddByHandLink />
          </p>
        </div>
      ) : search.isLoading ? (
        <p className="flex items-center gap-2 text-muted" role="status">
          <CircleNotchIcon size={18} className="animate-spin" /> Searching Open Library and Google Books&hellip;
        </p>
      ) : response && !response.ok ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center" role="alert">
          {response.error === 'offline' || !online ? (
            <WifiSlashIcon size={36} weight="duotone" className="mx-auto text-muted" />
          ) : (
            <WarningCircleIcon size={36} weight="duotone" className="mx-auto text-muted" />
          )}
          <p className="mt-3 mb-1 font-medium">{errorText(response.error)}</p>
          <p className="m-0 text-[14px] text-muted">
            Books already in your library still work offline. You can also type this one in yourself.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Button onClick={() => navigate(manualLink)}>
              <PlusIcon size={16} weight="bold" /> Add it by hand
            </Button>
            <Button variant="secondary" onClick={() => search.refetch()}>
              Try again
            </Button>
          </div>
        </div>
      ) : (
        <>
          {response?.ok &&
            response.data.notices
              .filter((n) => NOTICES[n])
              .map((n) => (
                <p key={n} className="mb-5 rounded-lg bg-gilt/12 px-4 py-3 text-[14px]" role="status">
                  {NOTICES[n]}{' '}
                  {n === 'google_quota' && (
                    <Link to="/settings" className="font-medium text-accent hover:underline">
                      Open Settings
                    </Link>
                  )}
                </p>
              ))}
          <p className="mt-0 mb-5 text-[14px] text-muted">
            {results.length ? `${results.length} results for “${q}”` : `Nothing found for “${q}”.`}{' '}
            <AddByHandLink />
          </p>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-7 gap-y-9 p-0" data-testid="search-results">
            {results.map((r, i) => (
              <ResultCard key={`${r.ref.olWorkKey ?? r.ref.googleId}-${i}`} result={r} suggested={suggested} onOpen={() => openBook(r)} />
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function ResultCard({ result, suggested, onOpen }: { result: CatalogResult; suggested?: AddTarget; onOpen: () => void }) {
  const author = result.authors.slice(0, 2).join(', ')
  const getBook = () => fetchBook(result.ref)
  const warm = (): void => {
    prefetchDetails(result.ref)
    prefetchCover(result.coverUrl)
  }

  return (
    <li className="flex flex-col" onMouseEnter={warm} onFocus={warm}>
      <button type="button" onClick={onOpen} className="group block rounded-md text-left outline-offset-4" title={`See everything about ${result.title}`}>
        <RemoteCover
          url={listCover(result.coverUrl)}
          title={result.title}
          author={author}
          className="transition duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_14px_28px_-12px_rgb(0_0_0/0.5)]"
        />
        <div className="mt-2.5">
          <div className="line-clamp-2 text-[14px] font-medium leading-snug text-ink">{result.title}</div>
          <div className="truncate text-[13px] text-muted">{author || 'Unknown author'}</div>
          <div className="text-[12px] text-muted">
            {[result.firstPublishYear, result.editionCount && `${result.editionCount} ${result.editionCount === 1 ? 'edition' : 'editions'}`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      </button>
      <div className="mt-2">
        <SaveToShelf getBook={getBook} title={result.title} inLibraryId={result.inLibraryId} suggested={suggested} size="sm" />
      </div>
    </li>
  )
}
