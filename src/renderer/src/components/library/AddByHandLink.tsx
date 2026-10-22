import { Link } from 'react-router'
import type { Shelf } from '../../../../shared/books'

/** The rarely-needed fallback: type a book in yourself when it can't be found online. */
export function AddByHandLink({ shelf }: { shelf?: Shelf }) {
  return (
    <Link to={shelf ? `/add?shelf=${shelf}` : '/add'} className="text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline">
      or add one by hand
    </Link>
  )
}
