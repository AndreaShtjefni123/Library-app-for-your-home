import type { DbInfo, DbStatus } from '../../shared/ipc'
import { loadDbConfig } from '../config'
import { getPool, openPool } from './pool'
import { bundledMigrations } from './bundledMigrations'
import { migrate, schemaVersion } from './migrate'
import { statusFromError } from './errors'
import { backfillCoverExtras } from '../services/covers'
import { electronImageTools } from '../services/imageTools'
import { coversDir } from '../paths'

/** Connects with the saved settings and brings the tables up to date. Called at startup and on "Retry". */
export async function connectAndMigrate(): Promise<DbStatus> {
  const config = await loadDbConfig()
  if (!config) return { state: 'no_config' }
  try {
    const pool = openPool(config)
    await pool.query('SELECT 1')
    await migrate(pool, bundledMigrations())
    // Quietly add previews and colours to covers saved before those existed.
    backfillCoverExtras(pool, coversDir(), electronImageTools).catch(() => {})
    return { state: 'ok' }
  } catch (err) {
    return statusFromError(err, config.database)
  }
}

export async function dbInfo(): Promise<DbInfo> {
  const config = await loadDbConfig()
  if (!config) throw new Error('Not set up')
  const pool = getPool()
  const server = await pool.query<{ server_version: string }>('SHOW server_version')
  return {
    database: config.database,
    user: config.user,
    host: config.host,
    port: config.port,
    schemaVersion: await schemaVersion(pool),
    serverVersion: server.rows[0].server_version
  }
}
