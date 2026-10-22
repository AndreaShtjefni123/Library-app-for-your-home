import type { ReactNode } from 'react'
import type { BookDetail } from '../../../../shared/books'
import { FORMAT_LABELS, ROLE_LABELS } from '../../../../shared/books'
import { Rating } from '../discover/parts'

/**
 * Everything general about a book (what the catalogues and the publisher say), shown behind the
 * "Book info" button. The rating here is the website average, never your own stars.
 */
export function BookInfoView({ book }: { book: BookDetail }) {
  const seriesText = book.series && `${book.series.name}${book.series.number !== null ? `, book ${book.series.number}` : ''}`

  // One short line: series · first published · pages · format · language
  const firstYear = book.firstPublishedYear ?? book.pubYear
  const meta = [
    seriesText,
    firstYear !== null && (book.firstPublishedYear !== null ? `First published ${firstYear}` : `Published ${firstYear}`),
    book.pages !== null && `${book.pages} pages`,
    book.format && FORMAT_LABELS[book.format],
    book.language
  ].filter(Boolean) as string[]

  // Genres first, then subjects, without repeats (ignoring capital letters).
  const seen = new Set<string>()
  const chips = [...book.genres, ...book.subjects].filter((name) => {
    const key = name.trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Translators, editors etc. (the authors are already shown next to the title).
  const others = book.contributors.filter((c) => c.role !== 'author')
  const otherPeople = others.length
    ? others.map((c) => `${c.name} (${ROLE_LABELS[c.role]})`).join(', ')
    : null

  const rows: [string, ReactNode][] = [
    ['Publisher', book.publisher],
    ['Published', book.pubDate],
    ['Pages', book.pages],
    ['Format', book.format && FORMAT_LABELS[book.format]],
    ['Language', book.language],
    ['ISBN-13', book.isbn13],
    ['ISBN-10', book.isbn10],
    ['Series', seriesText],
    ['Other people', otherPeople]
  ]
  const shownRows = rows.filter(([, v]) => v !== null && v !== undefined && v !== '')

  return (
    <div className="grid gap-8" data-testid="book-info">
      <div className="grid gap-2">
        <div data-testid="website-rating">
          {book.ratingAvg !== null ? (
            <Rating avg={book.ratingAvg} count={book.ratingCount} />
          ) : (
            <span className="text-[14px] text-muted">No online rating</span>
          )}
        </div>
        {meta.length > 0 && <div className="text-[14px] text-muted">{meta.join(' · ')}</div>}
      </div>

      {book.description ? (
        <p className="m-0 max-w-prose whitespace-pre-line text-[15px] leading-relaxed">{book.description}</p>
      ) : (
        <p className="m-0 text-muted">No description yet.</p>
      )}

      {chips.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Genres and subjects">
          {chips.map((name) => (
            <li key={name} className="rounded-full border border-border bg-surface px-3 py-1 text-[12px] text-ink/80">
              {name}
            </li>
          ))}
        </ul>
      )}

      {shownRows.length > 0 && (
        <section className="grid gap-3">
          <h2 className="m-0 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">Edition</h2>
          <dl className="m-0 grid max-w-lg grid-cols-[120px_1fr] gap-x-6 gap-y-2 text-[14px]">
            {shownRows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="m-0 select-text">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {book.links.length > 0 && (
        <div className="flex flex-wrap gap-4 text-[14px]">
          {book.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              View on {l.label} &#x2197;
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
