// Book shapes shared by the database layer and the screens. No runtime imports (used by preload).

export const FORMATS = ['hardcover', 'paperback', 'ebook', 'audiobook', 'other'] as const
export type BookFormat = (typeof FORMATS)[number]
export const FORMAT_LABELS: Record<BookFormat, string> = {
  hardcover: 'Hardcover',
  paperback: 'Paperback',
  ebook: 'Ebook',
  audiobook: 'Audiobook',
  other: 'Other'
}

export const ROLES = ['author', 'editor', 'translator', 'illustrator', 'narrator', 'foreword', 'contributor'] as const
export type ContributorRole = (typeof ROLES)[number]
export const ROLE_LABELS: Record<ContributorRole, string> = {
  author: 'Author',
  editor: 'Editor',
  translator: 'Translator',
  illustrator: 'Illustrator',
  narrator: 'Narrator',
  foreword: 'Foreword',
  contributor: 'Contributor'
}

/** owned = Own shelf; wishlist = Want to buy; none = neither (e.g. a library book). */
export const OWNERSHIP = ['owned', 'wishlist', 'none'] as const
export type Ownership = (typeof OWNERSHIP)[number]
export const OWNERSHIP_LABELS: Record<Ownership, string> = {
  owned: 'I own it',
  wishlist: 'Want to buy',
  none: 'Neither'
}

export const READING_STATUSES = ['want', 'reading', 'partly_read', 'read', 'dnf'] as const
export type ReadingStatus = (typeof READING_STATUSES)[number]
export const READING_LABELS: Record<ReadingStatus, string> = {
  want: 'To-read pile',
  reading: 'Currently reading',
  partly_read: 'Partly read',
  read: 'Read',
  dnf: 'Did not finish'
}

/** Sidebar shelves. Own / Want to buy come from ownership; the rest from reading status. */
export const SHELVES = ['own', 'read', 'reading', 'partly-read', 'to-read', 'want-to-buy', 'dnf'] as const
export type Shelf = (typeof SHELVES)[number]
export const SHELF_READING: Partial<Record<Shelf, ReadingStatus>> = {
  read: 'read',
  reading: 'reading',
  'partly-read': 'partly_read',
  'to-read': 'want',
  dnf: 'dnf'
}

export const SORT_KEYS = ['title', 'author', 'year', 'pages', 'format', 'added', 'progress'] as const
export type SortKey = (typeof SORT_KEYS)[number]
export const SORT_LABELS: Record<SortKey, string> = {
  title: 'Title',
  author: 'Author',
  year: 'Year',
  pages: 'Pages',
  format: 'Format',
  added: 'Date added',
  progress: '% read'
}
export type SortDir = 'asc' | 'desc'

export interface ListParams {
  shelf?: Shelf
  sort: SortKey
  dir: SortDir
  offset: number
  limit: number
}

export interface BookSummary {
  id: string
  title: string
  subtitle: string | null
  authors: string[]
  pubYear: number | null
  pages: number | null
  format: BookFormat | null
  ownership: Ownership
  readingStatus: ReadingStatus | null
  coverPath: string | null
  /** Changes whenever the book changes, so a new cover isn't hidden behind the old cached one. */
  coverVersion: string
  createdAt: string
  currentPage: number | null
  progressPercent: number | null
  lastReadAt: string | null
  pausedNote: string | null
}

export interface BookPage {
  items: BookSummary[]
  total: number
}

export interface Contributor {
  name: string
  role: ContributorRole
}

export interface BookDetail extends BookSummary {
  sortTitle: string
  contributors: Contributor[]
  isbn13: string | null
  isbn10: string | null
  publisher: string | null
  pubDate: string | null
  language: string | null
  description: string | null
  series: { name: string; number: number | null } | null
  genres: string[]
  tags: string[]
  copies: { id: string; accessionNo: string; status: string }[]
  startedAt: string | null
  finishedAt: string | null
  /** Your rating, ½ to 5 stars. */
  rating: number | null
  review: string | null
  notes: string | null
  /** Main colour of the cover, for spines on the shelf. */
  spineColour: string | null
  /** When the reading status / progress last changed (for "haven't read this in a while?"). */
  readingUpdatedAt: string | null
  suggestSnoozedUntil: string | null
  updatedAt: string
  /** Average rating from readers online (Open Library / Google Books), 0 to 5. Not your rating. */
  ratingAvg: number | null
  ratingCount: number | null
  /** Topics the online catalogues list for the book. */
  subjects: string[]
  /** Year the book first came out (any edition). */
  firstPublishedYear: number | null
  /** The book's pages on Open Library / Google Books. */
  links: { label: string; url: string }[]
}

export const CONDITIONS = ['new', 'fine', 'very_good', 'good', 'fair', 'poor'] as const
export type Condition = (typeof CONDITIONS)[number]
export const CONDITION_LABELS: Record<Condition, string> = {
  new: 'New',
  fine: 'Fine (like new)',
  very_good: 'Very good',
  good: 'Good',
  fair: 'Fair (well read)',
  poor: 'Poor'
}

/** Your physical copy of a book. */
export interface CopyDetails {
  id: string
  accessionNo: string
  format: BookFormat | null
  condition: Condition | null
  locationNote: string | null
  acquiredDate: string | null
  acquiredSource: string | null
  price: string | null
  currency: string | null
  giftFrom: string | null
  isSigned: boolean
  signedBy: string | null
  isFirstEdition: boolean
  limitedNumber: string | null
  notes: string | null
}
export type CopyPatch = Partial<Omit<CopyDetails, 'id' | 'accessionNo'>>

export interface Quote {
  id: string
  text: string
  page: number | null
  comment: string | null
}

export interface ProgressEntry {
  id: string
  page: number | null
  percent: number | null
  loggedAt: string
}

/** What the add/edit form sends. Validation rules live in schemas.ts. */
export interface BookInput {
  title: string
  subtitle?: string
  contributors: Contributor[]
  publisher?: string
  pubDate?: string
  pages?: number
  isbn?: string
  format?: BookFormat
  language?: string
  description?: string
  seriesName?: string
  seriesNumber?: number
  ownership: Ownership
  readingStatus?: ReadingStatus | null
}

export interface DuplicateCandidate {
  id: string
  title: string
  authors: string[]
  pubYear: number | null
  reason: 'isbn' | 'title'
}

export type ShelfCounts = Record<Shelf, number> & { all: number }

/** A shelf in the "Save to…" panel: how many books, and a few recent covers. */
export interface ShelfPreview {
  shelf: Shelf
  count: number
  recent: { id: string; title: string; coverPath: string | null }[]
}

export interface SetReadingInput {
  id: string
  status: ReadingStatus | null
  /** Partly read: how far you got and where you stopped. */
  currentPage?: number | null
  progressPercent?: number | null
  note?: string | null
}
