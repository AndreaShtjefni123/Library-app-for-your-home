import { contextBridge, ipcRenderer } from 'electron'
import {
  Channels,
  type AppInfo,
  type DbInfo,
  type DbStatus,
  type SetupInput,
  type SetupResult,
  type SetupStepId,
  type ThemeMode
} from '../shared/ipc'
import type {
  BookDetail,
  BookInput,
  BookPage,
  DuplicateCandidate,
  ListParams,
  Ownership,
  SetReadingInput,
  ShelfCounts,
  ShelfPreview,
  CopyDetails,
  CopyPatch,
  ProgressEntry,
  Quote
} from '../shared/books'
import type {
  AddResult,
  AddTarget,
  CatalogBook,
  CatalogEdition,
  CatalogRef,
  CatalogResponse,
  CatalogResult,
  CatalogSearch,
  LocalSuggestions,
  SuggestMode
} from '../shared/catalog'

const invoke = ipcRenderer.invoke.bind(ipcRenderer)

// The renderer's only door to the rest of the app.
const api = {
  appInfo: (): Promise<AppInfo> => ipcRenderer.invoke(Channels.appInfo),
  setTheme: (mode: ThemeMode): Promise<void> => ipcRenderer.invoke(Channels.setTheme, mode),
  db: {
    status: (): Promise<DbStatus> => ipcRenderer.invoke(Channels.dbStatus),
    info: (): Promise<DbInfo> => ipcRenderer.invoke(Channels.dbInfo),
    startService: (): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke(Channels.dbStartService),
    setup: (input: SetupInput, onStep: (step: SetupStepId) => void): Promise<SetupResult> => {
      const channel = `${Channels.dbSetup}:progress`
      const listener = (_e: Electron.IpcRendererEvent, step: SetupStepId): void => onStep(step)
      ipcRenderer.on(channel, listener)
      return ipcRenderer
        .invoke(Channels.dbSetup, input)
        .finally(() => ipcRenderer.removeListener(channel, listener))
    }
  },
  books: {
    list: (params: ListParams): Promise<BookPage> => invoke(Channels.booksList, params),
    get: (id: string): Promise<BookDetail | null> => invoke(Channels.booksGet, id),
    create: (input: BookInput): Promise<string> => invoke(Channels.booksCreate, input),
    update: (id: string, input: Omit<BookInput, 'ownership' | 'readingStatus'>): Promise<void> =>
      invoke(Channels.booksUpdate, id, input),
    remove: (id: string): Promise<void> => invoke(Channels.booksDelete, id),
    restore: (id: string): Promise<void> => invoke(Channels.booksRestore, id),
    orderedIds: (params: Pick<ListParams, 'sort' | 'dir' | 'shelf'>): Promise<string[]> =>
      invoke(Channels.booksOrderedIds, params),
    duplicates: (input: Pick<BookInput, 'title' | 'isbn' | 'contributors'>, excludeId?: string): Promise<DuplicateCandidate[]> =>
      invoke(Channels.booksDuplicates, input, excludeId ?? null),
    addCopy: (id: string): Promise<void> => invoke(Channels.booksAddCopy, id),
    /** The saved cover's image bytes (for effects drawn on the graphics card). */
    coverBytes: (id: string): Promise<Uint8Array | null> => invoke(Channels.coverBytes, id)
  },
  shelves: {
    counts: (): Promise<ShelfCounts> => invoke(Channels.shelvesCounts),
    previews: (): Promise<ShelfPreview[]> => invoke(Channels.shelvesPreviews),
    setOwnership: (id: string, ownership: Ownership): Promise<void> =>
      invoke(Channels.shelvesSetOwnership, { id, ownership }),
    setReading: (input: SetReadingInput): Promise<void> => invoke(Channels.shelvesSetReading, input)
  },
  covers: {
    /** Sets a new cover (JPEG/PNG bytes). The old one is kept for Undo. */
    set: (bookId: string, bytes: Uint8Array): Promise<void> => invoke(Channels.coverSet, bookId, bytes),
    remove: (bookId: string): Promise<void> => invoke(Channels.coverRemove, bookId),
    undo: (bookId: string): Promise<void> => invoke(Channels.coverUndo, bookId)
  },
  mine: {
    copies: (bookId: string): Promise<CopyDetails[]> => invoke(Channels.copiesList, bookId),
    updateCopy: (copyId: string, patch: CopyPatch): Promise<CopyDetails> => invoke(Channels.copiesUpdate, copyId, patch),
    removeCopy: (copyId: string): Promise<void> => invoke(Channels.copiesRemove, copyId),
    setRating: (bookId: string, rating: number | null): Promise<void> => invoke(Channels.mineSetRating, bookId, rating),
    setWriting: (bookId: string, field: 'review' | 'notes', text: string | null): Promise<void> =>
      invoke(Channels.mineSetWriting, bookId, { field, text }),
    setDates: (bookId: string, startedAt: string | null, finishedAt: string | null): Promise<void> =>
      invoke(Channels.mineSetDates, bookId, { startedAt, finishedAt }),
    setTags: (bookId: string, tags: string[]): Promise<void> => invoke(Channels.mineSetTags, bookId, tags),
    allTags: (): Promise<string[]> => invoke(Channels.mineAllTags),
    quotes: (bookId: string): Promise<Quote[]> => invoke(Channels.quotesList, bookId),
    saveQuote: (bookId: string, quote: { id?: string; text: string; page: number | null; comment: string | null }): Promise<void> =>
      invoke(Channels.quotesSave, bookId, quote),
    deleteQuote: (quoteId: string): Promise<void> => invoke(Channels.quotesDelete, quoteId),
    orderQuotes: (bookId: string, ids: string[]): Promise<void> => invoke(Channels.quotesOrder, bookId, ids),
    logProgress: (bookId: string, page: number | null, percent: number | null): Promise<number | null> =>
      invoke(Channels.progressLog, bookId, { page, percent }),
    progress: (bookId: string): Promise<ProgressEntry[]> => invoke(Channels.progressList, bookId),
    deleteProgress: (entryId: string): Promise<void> => invoke(Channels.progressDelete, entryId),
    /** Put off "haven't read this in a while?" for some days, or turn it off (null). */
    snooze: (bookId: string, days: number | null): Promise<void> => invoke(Channels.suggestSnooze, bookId, days),
    suggestDays: (): Promise<number> => invoke(Channels.settingsGetSuggestDays),
    setSuggestDays: (days: number): Promise<void> => invoke(Channels.settingsSetSuggestDays, days)
  },
  /** Called when books change in the background (e.g. a cover finished downloading). */
  onBooksChanged: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(Channels.booksChanged, listener)
    return () => ipcRenderer.removeListener(Channels.booksChanged, listener)
  },
  catalog: {
    search: (q: string): Promise<CatalogResponse<CatalogSearch>> => invoke(Channels.catalogSearch, q),
    suggest: (q: string, mode: SuggestMode = 'full'): Promise<CatalogResponse<CatalogResult[]>> =>
      invoke(Channels.catalogSuggest, q, mode),
    suggestLocal: (q: string): Promise<LocalSuggestions> => invoke(Channels.catalogSuggestLocal, q),
    details: (ref: CatalogRef): Promise<CatalogResponse<CatalogBook>> => invoke(Channels.catalogDetails, ref),
    editions: (workKey: string): Promise<CatalogResponse<CatalogEdition[]>> => invoke(Channels.catalogEditions, workKey),
    add: (book: CatalogBook, target: AddTarget): Promise<CatalogResponse<AddResult>> =>
      invoke(Channels.catalogAdd, book, target)
  },
  settings: {
    getGoogleKey: (): Promise<string | null> => invoke(Channels.settingsGetGoogleKey),
    setGoogleKey: (key: string): Promise<void> => invoke(Channels.settingsSetGoogleKey, key)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
