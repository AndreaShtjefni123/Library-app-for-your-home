import { app, BrowserWindow, ipcMain } from 'electron'
import { z } from 'zod'
import { Channels, type AppInfo, type SetupStepId } from '../shared/ipc'
import {
  BookInputSchema,
  IdSchema,
  ListParamsSchema,
  SetOwnershipSchema,
  SetReadingSchema,
  SetupInputSchema,
  ThemeInputSchema
} from '../shared/schemas'
import { getPool } from './db/pool'
import {
  addCopy,
  createBook,
  deleteBook,
  getBook,
  listBooks,
  orderedIds,
  restoreBook,
  updateBook
} from './db/repos/editions'
import { findDuplicates } from './db/repos/duplicates'
import { setOwnership, setReadingStatus, shelfCounts, shelfPreviews } from './db/repos/shelves'
import { getSetting, GOOGLE_KEY_SETTING, setSetting, SUGGEST_DAYS_SETTING } from './db/repos/settings'
import { getDetails, listEditions, searchCatalog, suggestCatalog, suggestLocal } from './services/catalog'
import { addFromCatalog, savePictures } from './services/importFromCatalog'
import { fetchImage, NetError } from './services/net'
import { coversDir } from './paths'
import { readCover, removeBookCover, restorePreviousCover, storeBookCover } from './services/covers'
import { electronImageTools } from './services/imageTools'
import {
  allTags,
  deleteProgress,
  deleteQuote,
  listCopies,
  listProgress,
  listQuotes,
  logProgress,
  orderQuotes,
  removeCopy,
  saveQuote,
  setRating,
  setReadingDates,
  setTags,
  setWriting,
  snoozeSuggestion,
  updateCopy
} from './db/repos/personal'
import type { CatalogResponse } from '../shared/catalog'
import {
  AddTargetSchema,
  CatalogBookSchema,
  CatalogRefSchema,
  GoogleKeySchema,
  SearchQuerySchema,
  SuggestModeSchema,
  CopyPatchSchema,
  CoverBytesSchema,
  DatesSchema,
  ProgressSchema,
  QuoteSchema,
  RatingSchema,
  SnoozeSchema,
  SuggestDaysSchema,
  TagsSchema,
  WritingSchema,
  WorkKeySchema
} from '../shared/schemas'

/** Runs a catalogue call and turns any failure into a plain answer the screen can show. */
async function answer<T>(work: () => Promise<T>): Promise<CatalogResponse<T>> {
  try {
    return { ok: true, data: await work() }
  } catch (err) {
    if (err instanceof NetError) return { ok: false, error: err.kind, message: err.message }
    return { ok: false, error: 'unknown', message: (err as Error).message }
  }
}

/** The catalogues' original answers for this book (kept with it in the database). */
async function rawFor(ref: { olWorkKey?: string; googleId?: string }): Promise<unknown> {
  const pattern = ref.olWorkKey ? `details:${ref.olWorkKey}:%` : ref.googleId ? `details:%:%:${ref.googleId}:%` : null
  if (!pattern) return undefined
  const r = await getPool().query<{ raw: unknown }>(
    "SELECT value->'raw' AS raw FROM metadata_cache WHERE key LIKE $1 ORDER BY fetched_at DESC LIMIT 1",
    [pattern]
  )
  return r.rows[0]?.raw ?? undefined
}
import { connectAndMigrate, dbInfo } from './db/health'
import { runSetup } from './db/setup'
import { startPostgresService } from './db/service'
import { frameColours, TITLE_BAR_HEIGHT } from './theme'

export function registerIpc(): void {
  ipcMain.handle(Channels.appInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    dataFolder: app.getPath('userData')
  }))

  ipcMain.handle(Channels.setTheme, (event, mode: unknown) => {
    const colours = frameColours[ThemeInputSchema.parse(mode)]
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.setBackgroundColor(colours.bg)
    win?.setTitleBarOverlay({ color: colours.bg, symbolColor: colours.symbols, height: TITLE_BAR_HEIGHT })
  })

  ipcMain.handle(Channels.dbStatus, () => connectAndMigrate())

  ipcMain.handle(Channels.dbSetup, (event, input: unknown) => {
    const parsed = SetupInputSchema.parse(input)
    const progress = (step: SetupStepId): void => event.sender.send(`${Channels.dbSetup}:progress`, step)
    return runSetup(parsed, progress)
  })

  ipcMain.handle(Channels.dbStartService, () => startPostgresService())

  ipcMain.handle(Channels.dbInfo, () => dbInfo())

  // ---------- Books (every input is validated before it reaches the database) ----------

  const BookUpdateSchema = BookInputSchema.omit({ ownership: true, readingStatus: true })
  const OrderSchema = ListParamsSchema.pick({ sort: true, dir: true, shelf: true })

  ipcMain.handle(Channels.booksList, (_e, params: unknown) => listBooks(getPool(), ListParamsSchema.parse(params)))
  ipcMain.handle(Channels.booksGet, (_e, id: unknown) => getBook(getPool(), IdSchema.parse(id)))
  ipcMain.handle(Channels.booksCreate, (_e, input: unknown) => createBook(getPool(), BookInputSchema.parse(input)))
  ipcMain.handle(Channels.booksUpdate, (_e, id: unknown, input: unknown) =>
    updateBook(getPool(), IdSchema.parse(id), BookUpdateSchema.parse(input))
  )
  ipcMain.handle(Channels.booksDelete, (_e, id: unknown) => deleteBook(getPool(), IdSchema.parse(id)))
  ipcMain.handle(Channels.booksRestore, (_e, id: unknown) => restoreBook(getPool(), IdSchema.parse(id)))
  ipcMain.handle(Channels.booksOrderedIds, (_e, params: unknown) => orderedIds(getPool(), OrderSchema.parse(params)))
  ipcMain.handle(Channels.booksDuplicates, (_e, input: unknown, excludeId: unknown) =>
    findDuplicates(
      getPool(),
      BookInputSchema.pick({ title: true, isbn: true, contributors: true }).parse(input),
      excludeId == null ? undefined : IdSchema.parse(excludeId)
    )
  )
  ipcMain.handle(Channels.booksAddCopy, (_e, id: unknown) => addCopy(getPool(), IdSchema.parse(id)))
  ipcMain.handle(Channels.coverBytes, async (_e, id: unknown) => (await readCover(coversDir(), 'books', IdSchema.parse(id)))?.bytes ?? null)

  ipcMain.handle(Channels.shelvesCounts, () => shelfCounts(getPool()))
  ipcMain.handle(Channels.shelvesSetOwnership, (_e, input: unknown) => {
    const { id, ownership } = SetOwnershipSchema.parse(input)
    return setOwnership(getPool(), id, ownership)
  })
  ipcMain.handle(Channels.shelvesSetReading, (_e, input: unknown) => setReadingStatus(getPool(), SetReadingSchema.parse(input)))

  // ---------- Online catalogue ----------

  ipcMain.handle(Channels.catalogSearch, (_e, q: unknown) => answer(() => searchCatalog(getPool(), SearchQuerySchema.parse(q))))
  ipcMain.handle(Channels.catalogSuggest, (_e, q: unknown, mode: unknown) =>
    answer(() => suggestCatalog(getPool(), SearchQuerySchema.parse(q), SuggestModeSchema.parse(mode ?? 'full')))
  )
  ipcMain.handle(Channels.catalogSuggestLocal, (_e, q: unknown) => suggestLocal(getPool(), SearchQuerySchema.parse(q)))
  ipcMain.handle(Channels.shelvesPreviews, () => shelfPreviews(getPool()))
  ipcMain.handle(Channels.catalogDetails, (_e, ref: unknown) =>
    answer(() => getDetails(getPool(), CatalogRefSchema.parse(ref)))
  )
  ipcMain.handle(Channels.catalogEditions, (_e, workKey: unknown) =>
    answer(() => listEditions(getPool(), WorkKeySchema.parse(workKey)))
  )
  ipcMain.handle(Channels.catalogAdd, async (event, book: unknown, target: unknown) => {
    const parsed = CatalogBookSchema.parse(book)
    const raw = await rawFor(parsed.ref)
    const result = await answer(() =>
      addFromCatalog(getPool(), parsed, AddTargetSchema.parse(target), { coversDir: coversDir(), fetchImage, raw, imageTools: electronImageTools })
    )
    // Answer straight away; the cover and author photos download afterwards and the screen is told.
    if (result.ok && !result.data.existed) {
      savePictures(getPool(), result.data.id, parsed, { coversDir: coversDir(), fetchImage, imageTools: electronImageTools })
        .then((changed) => changed && !event.sender.isDestroyed() && event.sender.send(Channels.booksChanged))
        .catch(() => {})
    }
    return result
  })

  ipcMain.handle(Channels.settingsGetGoogleKey, () => getSetting<string>(getPool(), GOOGLE_KEY_SETTING))
  ipcMain.handle(Channels.settingsSetGoogleKey, (_e, value: unknown) =>
    setSetting(getPool(), GOOGLE_KEY_SETTING, GoogleKeySchema.parse(value))
  )

  // ---------- Make it yours ----------

  const id = (v: unknown): string => IdSchema.parse(v)
  const pool = getPool

  ipcMain.handle(Channels.coverSet, async (_e, bookId: unknown, bytes: unknown) => {
    await storeBookCover(pool(), coversDir(), id(bookId), Buffer.from(CoverBytesSchema.parse(bytes)), electronImageTools)
  })
  ipcMain.handle(Channels.coverRemove, (_e, bookId: unknown) => removeBookCover(pool(), coversDir(), id(bookId)))
  ipcMain.handle(Channels.coverUndo, (_e, bookId: unknown) => restorePreviousCover(pool(), coversDir(), id(bookId), electronImageTools))

  ipcMain.handle(Channels.copiesList, (_e, bookId: unknown) => listCopies(pool(), id(bookId)))
  ipcMain.handle(Channels.copiesUpdate, (_e, copyId: unknown, patch: unknown) => updateCopy(pool(), id(copyId), CopyPatchSchema.parse(patch)))
  ipcMain.handle(Channels.copiesRemove, (_e, copyId: unknown) => removeCopy(pool(), id(copyId)))

  ipcMain.handle(Channels.mineSetRating, (_e, bookId: unknown, rating: unknown) => setRating(pool(), id(bookId), RatingSchema.parse(rating)))
  ipcMain.handle(Channels.mineSetWriting, (_e, bookId: unknown, input: unknown) => {
    const { field, text } = WritingSchema.parse(input)
    return setWriting(pool(), id(bookId), field, text)
  })
  ipcMain.handle(Channels.mineSetDates, (_e, bookId: unknown, input: unknown) => {
    const { startedAt, finishedAt } = DatesSchema.parse(input)
    return setReadingDates(pool(), id(bookId), startedAt, finishedAt)
  })
  ipcMain.handle(Channels.mineSetTags, (_e, bookId: unknown, tags: unknown) => setTags(pool(), id(bookId), TagsSchema.parse(tags)))
  ipcMain.handle(Channels.mineAllTags, () => allTags(pool()))

  ipcMain.handle(Channels.quotesList, (_e, bookId: unknown) => listQuotes(pool(), id(bookId)))
  ipcMain.handle(Channels.quotesSave, (_e, bookId: unknown, quote: unknown) => saveQuote(pool(), id(bookId), QuoteSchema.parse(quote)))
  ipcMain.handle(Channels.quotesDelete, (_e, quoteId: unknown) => deleteQuote(pool(), id(quoteId)))
  ipcMain.handle(Channels.quotesOrder, (_e, bookId: unknown, ids: unknown) => orderQuotes(pool(), id(bookId), z.array(z.uuid()).parse(ids)))

  ipcMain.handle(Channels.progressLog, (_e, bookId: unknown, input: unknown) => {
    const { page, percent } = ProgressSchema.parse(input)
    return logProgress(pool(), id(bookId), page, percent)
  })
  ipcMain.handle(Channels.progressList, (_e, bookId: unknown) => listProgress(pool(), id(bookId)))
  ipcMain.handle(Channels.progressDelete, (_e, entryId: unknown) => deleteProgress(pool(), id(entryId)))

  ipcMain.handle(Channels.suggestSnooze, (_e, bookId: unknown, days: unknown) => snoozeSuggestion(pool(), id(bookId), SnoozeSchema.parse(days)))
  ipcMain.handle(Channels.settingsGetSuggestDays, async () => (await getSetting<number>(pool(), SUGGEST_DAYS_SETTING)) ?? 30)
  ipcMain.handle(Channels.settingsSetSuggestDays, (_e, days: unknown) => setSetting(pool(), SUGGEST_DAYS_SETTING, SuggestDaysSchema.parse(days)))
}
