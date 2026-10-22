import type pg from 'pg'

/** Returns a cached catalogue answer if it is younger than maxAgeDays. */
export async function cacheGet<T>(db: pg.Pool, key: string, maxAgeDays: number): Promise<T | null> {
  const r = await db.query<{ value: T }>(
    `SELECT value FROM metadata_cache WHERE key = $1 AND fetched_at > now() - make_interval(days => $2)`,
    [key, maxAgeDays]
  )
  return r.rows[0]?.value ?? null
}

export async function cachePut(db: pg.Pool, key: string, value: unknown): Promise<void> {
  await db.query(
    `INSERT INTO metadata_cache (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, fetched_at = now()`,
    [key, JSON.stringify(value)]
  )
}
