import type pg from 'pg'

export interface Migration {
  version: number
  name: string
  sql: string
}

export function parseMigrations(sources: Record<string, string>): Migration[] {
  return Object.entries(sources)
    .map(([path, sql]) => {
      const file = path.split('/').pop()!
      const match = /^(\d+)_(.+)\.sql$/.exec(file)
      if (!match) throw new Error(`Badly named migration: ${file}`)
      return { version: Number(match[1]), name: match[2], sql }
    })
    .sort((a, b) => a.version - b.version)
}

// Any fixed number works; it just stops two copies of the app migrating at the same time.
const MIGRATION_LOCK = 4_172_031

/** Applies every migration not yet recorded in schema_migrations, each in its own transaction. */
export async function migrate(pool: pg.Pool, migrations: Migration[]): Promise<number[]> {
  const client = await pool.connect()
  const applied: number[] = []
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK])
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    integer PRIMARY KEY,
        name       text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`)
    const rows = await client.query<{ version: number }>('SELECT version FROM schema_migrations')
    const done = new Set(rows.rows.map((r) => r.version))

    for (const m of migrations) {
      if (done.has(m.version)) continue
      try {
        await client.query('BEGIN')
        await client.query(m.sql)
        await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [m.version, m.name])
        await client.query('COMMIT')
        applied.push(m.version)
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`Migration ${m.version}_${m.name} failed: ${(err as Error).message}`)
      }
    }
    return applied
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => {})
    client.release()
  }
}

export async function schemaVersion(pool: pg.Pool): Promise<number> {
  const r = await pool.query<{ v: number | null }>('SELECT max(version) AS v FROM schema_migrations')
  return r.rows[0]?.v ?? 0
}
