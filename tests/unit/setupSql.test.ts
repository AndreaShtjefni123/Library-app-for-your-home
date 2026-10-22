// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { databaseGrantStatements, roleStatements, schemaStatements } from '../../src/main/db/setupSql'

describe('setup SQL', () => {
  it('quotes the database name, apostrophe and space included', () => {
    expect(databaseGrantStatements("Home Library")).toEqual([
      `GRANT CONNECT, CREATE, TEMPORARY ON DATABASE "Home Library" TO "library_app"`
    ])
  })

  it('escapes quotes in the generated password', () => {
    const [sql] = roleStatements(false, "it's")
    expect(sql).toBe(`CREATE ROLE "library_app" WITH LOGIN CREATEDB PASSWORD 'it''s'`)
  })

  it('alters instead of creating when the login already exists', () => {
    expect(roleStatements(true, 'x')[0]).toMatch(/^ALTER ROLE "library_app"/)
  })

  it('never drops or deletes anything', () => {
    const all = [...roleStatements(false, 'x'), ...databaseGrantStatements('d'), ...schemaStatements()].join('\n')
    expect(all).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i)
  })
})
