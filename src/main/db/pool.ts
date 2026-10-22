import pg from 'pg'
import type { DbConfig } from '../config'

let pool: pg.Pool | null = null

/** Always pass a config object (never a URL): the database name contains an apostrophe and a space. */
export function clientConfig(c: DbConfig): pg.ClientConfig {
  return {
    host: c.host,
    port: c.port,
    database: c.database,
    user: c.user,
    password: c.password,
    application_name: "Home Library",
    connectionTimeoutMillis: 4000
  }
}

export function openPool(c: DbConfig): pg.Pool {
  pool?.end().catch(() => {})
  // Room for many small requests at once (search, suggestions, covers…), and patience if the
  // database is briefly busy rather than failing straight away.
  pool = new pg.Pool({ ...clientConfig(c), max: 10, connectionTimeoutMillis: 15_000, idleTimeoutMillis: 30_000 })
  // An idle client losing its connection (e.g. the service stopped) must not crash the app.
  pool.on('error', () => {})
  return pool
}

export function getPool(): pg.Pool {
  if (!pool) throw new Error('Database is not connected yet')
  return pool
}

export async function closePool(): Promise<void> {
  await pool?.end()
  pool = null
}
