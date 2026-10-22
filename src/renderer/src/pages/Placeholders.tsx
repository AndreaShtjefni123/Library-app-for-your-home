import { useParams, useNavigate } from 'react-router'
import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { SHELVES, type Shelf } from '../../../shared/books'
import { Button, ComingSoon, PageHeader } from '../components/PageHeader'
import { BookBrowser } from '../components/library/BookBrowser'
import { PartlyReadList } from '../components/library/PartlyReadList'
import { shelfTitles } from '../app/nav'

// Simple stand-in pages. Each one is replaced by the real screen in the roadmap step it names.

/** Books are normally found by searching online; typing one in by hand is the rare fallback. */
function FindBookButton({ shelf }: { shelf?: Shelf }) {
  const navigate = useNavigate()
  return (
    <Button onClick={() => navigate(shelf ? `/discover?shelf=${shelf}` : '/discover')}>
      <MagnifyingGlassIcon size={16} weight="bold" /> Find a book
    </Button>
  )
}

export function HomePage() {
  return (
    <>
      <PageHeader title="Welcome back" subtitle="Your library at a glance." actions={<FindBookButton />} />
      <ComingSoon step="5.1 – 5.3">
        Currently reading, &ldquo;Pick up where you left off&rdquo;, recently added books and your stats will live here.
      </ComingSoon>
    </>
  )
}

export function LibraryPage() {
  return (
    <>
      <PageHeader title="Library" subtitle="Every book you've registered." actions={<FindBookButton />} />
      <BookBrowser emptyText="Your shelves are waiting. Add your first book." />
    </>
  )
}

const SHELF_EMPTY: Record<Shelf, string> = {
  own: 'No books marked as owned yet.',
  read: 'Books you finish will gather here.',
  reading: 'Nothing on the go right now.',
  'partly-read': '',
  'to-read': 'Your to-read pile is empty — enjoy it while it lasts.',
  'want-to-buy': 'Nothing on your want-to-buy list yet.',
  dnf: 'No abandoned books. Impressive.'
}

export function ShelfPage() {
  const { shelf: param = '' } = useParams()
  const shelf = (SHELVES as readonly string[]).includes(param) ? (param as Shelf) : undefined
  const title = shelf ? shelfTitles[shelf] : 'Shelf'
  const note =
    shelf === 'partly-read'
      ? 'Books you have read half or most of but not finished, with how far you got and where you stopped.'
      : `Books on your “${title}” shelf.`
  return (
    <>
      <PageHeader title={title} subtitle={note} actions={shelf !== 'partly-read' && <FindBookButton shelf={shelf} />} />
      {shelf === 'partly-read' ? <PartlyReadList /> : <BookBrowser key={shelf} shelf={shelf} emptyText={shelf ? SHELF_EMPTY[shelf] : ''} />}
    </>
  )
}

export function StatsPage() {
  return (
    <>
      <PageHeader title="Stats" subtitle="Your reading and collection in numbers." />
      <ComingSoon step="5.4 – 5.5">Counts, reading per year, spending and charts.</ComingSoon>
    </>
  )
}
