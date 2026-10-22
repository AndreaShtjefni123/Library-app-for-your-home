import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Shelf, SortDir, SortKey } from '../../../shared/books'

export type LibraryView = 'grid' | 'list'

interface LibraryState {
  view: LibraryView
  sort: SortKey
  dir: SortDir
  /** The list the user last browsed, so the book page's ←/→ follow the same order. */
  lastShelf: Shelf | undefined
  setView: (view: LibraryView) => void
  setSort: (sort: SortKey, dir?: SortDir) => void
  setLastShelf: (shelf: Shelf | undefined) => void
}

export const DEFAULT_DIR: Record<SortKey, SortDir> = {
  title: 'asc',
  author: 'asc',
  year: 'desc',
  pages: 'desc',
  format: 'asc',
  added: 'desc',
  progress: 'desc'
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set) => ({
      view: 'grid',
      sort: 'title',
      dir: 'asc',
      lastShelf: undefined,
      setView: (view) => set({ view }),
      setSort: (sort, dir) => set({ sort, dir: dir ?? DEFAULT_DIR[sort] }),
      setLastShelf: (lastShelf) => set({ lastShelf })
    }),
    { name: 'home-library-library' }
  )
)

/** Partly read always lists the most-read books first. */
export function sortFor(shelf: Shelf | undefined, sort: SortKey, dir: SortDir): { sort: SortKey; dir: SortDir } {
  if (shelf === 'partly-read') return { sort: 'progress', dir: 'desc' }
  if (sort === 'progress' && shelf !== 'reading') return { sort: 'title', dir: 'asc' }
  return { sort, dir }
}
