import { parseMigrations, type Migration } from './migrate'

/** Bundled into the app at build time, so the packaged .exe needs no loose .sql files. */
export function bundledMigrations(): Migration[] {
  const files = import.meta.glob('./migrations/*.sql', { query: '?raw', import: 'default', eager: true })
  return parseMigrations(files as Record<string, string>)
}
