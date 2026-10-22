// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseMigrations } from '../../src/main/db/migrate'
import { bundledMigrations } from '../../src/main/db/bundledMigrations'

describe('migrations', () => {
  it('orders migrations by their number', () => {
    const list = parseMigrations({ './migrations/0002_b.sql': 'B', './migrations/0001_a.sql': 'A' })
    expect(list.map((m) => [m.version, m.name])).toEqual([
      [1, 'a'],
      [2, 'b']
    ])
  })

  it('rejects badly named files', () => {
    expect(() => parseMigrations({ './migrations/init.sql': '' })).toThrow(/Badly named/)
  })

  it('bundles the real migration files with unique, increasing numbers', () => {
    const versions = bundledMigrations().map((m) => m.version)
    expect(versions.length).toBeGreaterThan(0)
    expect(versions[0]).toBe(1)
    expect(new Set(versions).size).toBe(versions.length)
  })
})
