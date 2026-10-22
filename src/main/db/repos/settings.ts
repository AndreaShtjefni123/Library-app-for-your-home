import type pg from 'pg'

export async function getSetting<T>(db: pg.Pool, key: string): Promise<T | null> {
  const r = await db.query<{ value: T }>('SELECT value FROM setting WHERE key = $1', [key])
  return r.rows[0]?.value ?? null
}

export async function setSetting(db: pg.Pool, key: string, value: unknown): Promise<void> {
  if (value === null || value === undefined || value === '') {
    await db.query('DELETE FROM setting WHERE key = $1', [key])
    return
  }
  await db.query(
    `INSERT INTO setting (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)]
  )
}

export const GOOGLE_KEY_SETTING = 'googleBooksApiKey'
/** After how many days without progress to suggest moving a book to Partly read. */
export const SUGGEST_DAYS_SETTING = 'partlyReadSuggestDays'
