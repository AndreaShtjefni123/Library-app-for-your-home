import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'

/** Connection settings kept in %APPDATA%\HomeLibrary\config.json. The password is encrypted with Windows' own protection. */
export interface DbConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
}

interface StoredConfig {
  db?: Omit<DbConfig, 'password'> & { passwordEncrypted: string }
}

const configPath = (): string => join(app.getPath('userData'), 'config.json')

function readStored(): StoredConfig {
  if (!existsSync(configPath())) return {}
  try {
    return JSON.parse(readFileSync(configPath(), 'utf8')) as StoredConfig
  } catch {
    return {}
  }
}

function writeStored(stored: StoredConfig): void {
  // Write to a temp file first so a crash never leaves a half-written config.
  const tmp = configPath() + '.tmp'
  writeFileSync(tmp, JSON.stringify(stored, null, 2), 'utf8')
  renameSync(tmp, configPath())
}

/**
 * Development and automated tests only: lets a run point at a separate test database
 * via standard PG* environment variables, so tests never touch the real library.
 */
function configFromEnv(): DbConfig | null {
  if (app.isPackaged || process.env['HOME_LIBRARY_DB_FROM_ENV'] !== '1') return null
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env
  if (!PGUSER || !PGPASSWORD || !PGDATABASE) return null
  return { host: PGHOST ?? 'localhost', port: Number(PGPORT ?? 5432), database: PGDATABASE, user: PGUSER, password: PGPASSWORD }
}

export async function loadDbConfig(): Promise<DbConfig | null> {
  const fromEnv = configFromEnv()
  if (fromEnv) return fromEnv
  const db = readStored().db
  if (!db) return null
  try {
    const { result: password, shouldReEncrypt } = await safeStorage.decryptStringAsync(
      Buffer.from(db.passwordEncrypted, 'base64')
    )
    const config = { host: db.host, port: db.port, database: db.database, user: db.user, password }
    if (shouldReEncrypt) await saveDbConfig(config)
    return config
  } catch {
    return null
  }
}

export async function saveDbConfig(config: DbConfig): Promise<void> {
  const { password, ...rest } = config
  const passwordEncrypted = (await safeStorage.encryptStringAsync(password)).toString('base64')
  writeStored({ ...readStored(), db: { ...rest, passwordEncrypted } })
}
