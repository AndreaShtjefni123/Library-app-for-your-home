// Shared by main, preload and renderer. Keep this file free of runtime imports: the sandboxed preload can't load packages.

/** Everything the renderer and main process say to each other goes through these channels. */
export const Channels = {
  appInfo: 'app:getInfo',
  setTheme: 'app:setTheme',
  dbStatus: 'db:status',
  dbSetup: 'db:setup',
  dbStartService: 'db:startService',
  dbInfo: 'db:info',
  booksList: 'books:list',
  booksGet: 'books:get',
  booksCreate: 'books:create',
  booksUpdate: 'books:update',
  booksDelete: 'books:delete',
  booksRestore: 'books:restore',
  booksOrderedIds: 'books:orderedIds',
  booksDuplicates: 'books:duplicates',
  booksAddCopy: 'books:addCopy',
  coverBytes: 'covers:bytes',
  coverSet: 'covers:set',
  coverRemove: 'covers:remove',
  coverUndo: 'covers:undo',
  copiesList: 'copies:list',
  copiesUpdate: 'copies:update',
  copiesRemove: 'copies:remove',
  mineSetRating: 'mine:setRating',
  mineSetWriting: 'mine:setWriting',
  mineSetDates: 'mine:setDates',
  mineSetTags: 'mine:setTags',
  mineAllTags: 'mine:allTags',
  quotesList: 'quotes:list',
  quotesSave: 'quotes:save',
  quotesDelete: 'quotes:delete',
  quotesOrder: 'quotes:order',
  progressLog: 'progress:log',
  progressList: 'progress:list',
  progressDelete: 'progress:delete',
  suggestSnooze: 'suggest:snooze',
  settingsGetSuggestDays: 'settings:getSuggestDays',
  settingsSetSuggestDays: 'settings:setSuggestDays',
  shelvesCounts: 'shelves:counts',
  shelvesSetOwnership: 'shelves:setOwnership',
  shelvesSetReading: 'shelves:setReading',
  catalogSearch: 'catalog:search',
  catalogSuggest: 'catalog:suggest',
  catalogSuggestLocal: 'catalog:suggestLocal',
  shelvesPreviews: 'shelves:previews',
  catalogDetails: 'catalog:details',
  catalogEditions: 'catalog:editions',
  catalogAdd: 'catalog:add',
  /** Main → screen: books changed in the background (e.g. a cover finished downloading). */
  booksChanged: 'books:changed',
  settingsGetGoogleKey: 'settings:getGoogleKey',
  settingsSetGoogleKey: 'settings:setGoogleKey'
} as const

export type ThemeMode = 'light' | 'dark'

export interface AppInfo {
  name: string
  version: string
  dataFolder: string
}

export type DbStatus =
  | { state: 'ok' }
  | { state: 'no_config' }
  | { state: 'not_running' }
  | { state: 'auth_failed' }
  | { state: 'db_missing'; database: string }
  | { state: 'error'; message: string }

export interface DbInfo {
  database: string
  user: string
  host: string
  port: number
  schemaVersion: number
  serverVersion: string
}

export const DEFAULT_DATABASE = "Home Library"

export interface SetupInput {
  host: string
  port: number
  database: string
  superuser: string
  superuserPassword: string
}

export type SetupStepId = 'connect' | 'database' | 'user' | 'access' | 'extensions' | 'tables' | 'test'

export type SetupResult =
  | { ok: true }
  | { ok: false; step: SetupStepId; message: string; databases?: string[] }
