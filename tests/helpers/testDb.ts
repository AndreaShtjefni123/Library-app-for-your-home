import pg from 'pg'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { migrate, parseMigrations } from '../../src/main/db/migrate'

/** True when run through `npm run test:db`, which supplies the app's saved login. */
export const hasDb = Boolean(process.env.PGUSER && process.env.PGPASSWORD)

export function migrationsFromDisk() {
  const dir = join(__dirname, '../../src/main/db/migrations')
  const files = Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => [`./migrations/${f}`, readFileSync(join(dir, f), 'utf8')])
  )
  return parseMigrations(files)
}

/**
 * Creates a brand-new, empty database (dropping any old one with that name) and runs all
 * migrations. Refuses to touch the real library database.
 */
export async function freshDatabase(name: string): Promise<pg.Pool> {
  if (!/^home_library_(test|demo|e2e)\w*$/.test(name) || name === process.env.HOME_LIBRARY_REAL_DB) {
    throw new Error(`Refusing to recreate database "${name}"`)
  }
  const admin = new pg.Client({ database: 'postgres' })
  await admin.connect()
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${pg.escapeIdentifier(name)} WITH (FORCE)`)
    await admin.query(`CREATE DATABASE ${pg.escapeIdentifier(name)}`)
  } finally {
    await admin.end()
  }
  const pool = new pg.Pool({ database: name, max: 5 })
  await migrate(pool, migrationsFromDisk())
  return pool
}
