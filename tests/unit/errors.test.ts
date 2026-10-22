// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { statusFromError } from '../../src/main/db/errors'

describe('statusFromError', () => {
  const db = "Home Library"

  it('treats a refused connection as "not running"', () => {
    expect(statusFromError({ code: 'ECONNREFUSED' }, db)).toEqual({ state: 'not_running' })
  })

  it('recognises a wrong password', () => {
    expect(statusFromError({ code: '28P01' }, db)).toEqual({ state: 'auth_failed' })
  })

  it('reports a missing database by name', () => {
    expect(statusFromError({ code: '3D000' }, db)).toEqual({ state: 'db_missing', database: db })
  })

  it('passes other errors through with their message', () => {
    expect(statusFromError(new Error('boom'), db)).toEqual({ state: 'error', message: 'boom' })
  })
})
