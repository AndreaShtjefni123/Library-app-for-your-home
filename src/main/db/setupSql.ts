import pg from 'pg'

export const APP_ROLE = 'library_app'

const ident = (name: string): string => pg.escapeIdentifier(name)
const literal = (value: string): string => pg.escapeLiteral(value)

/** SQL run while connected to the server's maintenance database, as the PostgreSQL superuser. */
export function roleStatements(roleExists: boolean, rolePassword: string): string[] {
  const role = ident(APP_ROLE)
  // CREATEDB lets the automated tests create and drop their own separate test database.
  return roleExists
    ? [`ALTER ROLE ${role} WITH LOGIN CREATEDB PASSWORD ${literal(rolePassword)}`]
    : [`CREATE ROLE ${role} WITH LOGIN CREATEDB PASSWORD ${literal(rolePassword)}`]
}

export function databaseGrantStatements(database: string): string[] {
  return [`GRANT CONNECT, CREATE, TEMPORARY ON DATABASE ${ident(database)} TO ${ident(APP_ROLE)}`]
}

/** SQL run inside the library database itself, as the superuser. Nothing here drops or wipes data. */
export function schemaStatements(): string[] {
  const role = ident(APP_ROLE)
  return [
    `ALTER SCHEMA public OWNER TO ${role}`,
    `GRANT ALL ON ALL TABLES IN SCHEMA public TO ${role}`,
    `GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
    `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
    `CREATE EXTENSION IF NOT EXISTS unaccent`
  ]
}
