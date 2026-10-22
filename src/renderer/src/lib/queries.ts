import { QueryClient, useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query'
import type { BookPage, ListParams } from '../../../shared/books'

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } }
})

export const PAGE_SIZE = 200

export type ListContext = Pick<ListParams, 'shelf' | 'sort' | 'dir'>

export function useBookPages(context: ListContext) {
  return useInfiniteQuery<BookPage, Error, InfiniteData<BookPage>, unknown[], number>({
    queryKey: ['books', 'list', context],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => window.api.books.list({ ...context, offset: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0)
      return loaded < last.total ? loaded : undefined
    }
  })
}

export function useBook(id: string | undefined) {
  return useQuery({
    queryKey: ['books', 'one', id],
    queryFn: () => window.api.books.get(id!),
    enabled: Boolean(id)
  })
}

export function useOrderedIds(context: ListContext) {
  return useQuery({ queryKey: ['books', 'ids', context], queryFn: () => window.api.books.orderedIds(context) })
}

export function useShelfCounts() {
  return useQuery({ queryKey: ['books', 'counts'], queryFn: () => window.api.shelves.counts() })
}

/** Everything about books lives under the ['books'] key, so one call refreshes every view. */
export function refreshBooks(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: ['books'] })
}
