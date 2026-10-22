import type { DuplicateCandidate } from '../../../../shared/books'
import { Button } from '../PageHeader'
import { Modal } from '../ui'
import { PlaceholderCover } from '../library/PlaceholderCover'

interface DuplicateDialogProps {
  candidates: DuplicateCandidate[]
  onAnotherCopy: (id: string) => void
  onDifferentEdition: () => void
  onCancel: () => void
}

/** Shown when the book being added looks like one already in the library. */
export function DuplicateDialog({ candidates, onAnotherCopy, onDifferentEdition, onCancel }: DuplicateDialogProps) {
  const sameIsbn = candidates.some((c) => c.reason === 'isbn')
  return (
    <Modal title="You may already have this book" onClose={onCancel} wide>
      <p className="mt-0 text-muted">
        {sameIsbn
          ? 'A book with the same ISBN is already in your library.'
          : 'A book with a very similar title and author is already in your library.'}
      </p>
      <ul className="my-5 grid list-none gap-3 p-0">
        {candidates.map((c) => (
          <li key={c.id} className="flex items-center gap-4 rounded-xl border border-border p-3">
            <div className="w-10 shrink-0">
              <PlaceholderCover title={c.title} size="sm" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{c.title}</div>
              <div className="truncate text-[13px] text-muted">
                {[c.authors.join(', '), c.pubYear].filter(Boolean).join(' · ')}
                {c.reason === 'isbn' && ' · same ISBN'}
              </div>
            </div>
            <Button variant="secondary" onClick={() => onAnotherCopy(c.id)}>
              Add another copy
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onDifferentEdition}>It&rsquo;s a different edition &mdash; add it</Button>
      </div>
    </Modal>
  )
}
