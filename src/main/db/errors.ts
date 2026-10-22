import type { DbStatus } from '../../shared/ipc'

/** Turns a node-postgres / socket error into a status the UI knows how to explain. */
export function statusFromError(err: unknown, database: string): DbStatus {
  const e = err as { code?: string; message?: string }
  switch (e?.code) {
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
    case 'ENOTFOUND':
    case '57P03': // the database system is starting up
      return { state: 'not_running' }
    case '28P01': // invalid password
    case '28000': // invalid authorization
      return { state: 'auth_failed' }
    case '3D000': // database does not exist
      return { state: 'db_missing', database }
    default:
      return { state: 'error', message: e?.message ?? String(err) }
  }
}
