import pg from 'pg'
import { randomBytes } from 'node:crypto'
import type { SetupInput, SetupResult, SetupStepId } from '../../shared/ipc'
import { saveDbConfig, type DbConfig } from '../config'
import { clientConfig, openPool } from './pool'
import { bundledMigrations } from './bundledMigrations'
import { migrate } from './migrate'
import { statusFromError } from './errors'
import { APP_ROLE, databaseGrantStatements, roleStatements, schemaStatements } from './setupSql'

class StepError extends Error {
  constructor(
    public step: SetupStepId,
    message: string,
    public databases?: string[]
  ) {
    super(message)
  }
}

function friendly(err: unknown, database: string): string {
  const status = statusFromError(err, database)
  switch (status.state) {
    case 'not_running':
      return 'PostgreSQL is not running or not reachable on that host and port.'
    case 'auth_failed':
      return 'That password was not accepted. Check it and try again.'
    case 'db_missing':
      return `The database "${database}" was not found.`
    case 'error':
      return status.message
    default:
      return 'Something went wrong.'
  }
}

async function withClient<T>(config: pg.ClientConfig, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client(config)
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/**
 * One-time setup: creates the app's own login (library_app) and gives it access to the
 * existing library database. The superuser password is used only here and never stored.
 */
export async function runSetup(input: SetupInput, onStep: (step: SetupStepId) => void): Promise<SetupResult> {
  const superuser: DbConfig = {
    host: input.host,
    port: input.port,
    database: 'postgres',
    user: input.superuser,
    password: input.superuserPassword
  }
  const appPassword = randomBytes(24).toString('base64url')
  let step: SetupStepId = 'connect'

  try {
    onStep((step = 'connect'))
    await withClient(clientConfig(superuser), async (admin) => {
      onStep((step = 'database'))
      const dbs = await admin.query<{ datname: string }>(
        'SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY datname'
      )
      const names = dbs.rows.map((r) => r.datname)
      if (!names.includes(input.database)) {
        throw new StepError(
          'database',
          `The database "${input.database}" was not found. Pick yours from the list.`,
          names.filter((n) => n !== 'postgres')
        )
      }

      onStep((step = 'user'))
      const role = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [APP_ROLE])
      for (const sql of roleStatements(role.rowCount === 1, appPassword)) await admin.query(sql)

      onStep((step = 'access'))
      for (const sql of databaseGrantStatements(input.database)) await admin.query(sql)
    })

    onStep((step = 'extensions'))
    await withClient(clientConfig({ ...superuser, database: input.database }), async (admin) => {
      for (const sql of schemaStatements()) await admin.query(sql)
    })

    const appConfig: DbConfig = {
      host: input.host,
      port: input.port,
      database: input.database,
      user: APP_ROLE,
      password: appPassword
    }

    onStep((step = 'tables'))
    const pool = openPool(appConfig)
    await migrate(pool, bundledMigrations())

    onStep((step = 'test'))
    await pool.query('SELECT 1')
    await saveDbConfig(appConfig)
    return { ok: true }
  } catch (err) {
    if (err instanceof StepError) return { ok: false, step: err.step, message: err.message, databases: err.databases }
    return { ok: false, step, message: friendly(err, input.database) }
  }
}
