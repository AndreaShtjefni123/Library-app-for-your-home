// Runs a command with the app's saved PostgreSQL login in its environment (PGHOST, PGUSER, PGPASSWORD…).
// Used for the database tests and the demo seed. The password is never printed.
// Usage: electron scripts/with-db-env.cjs <command> [args…]
const { app, safeStorage } = require('electron')
const { spawn } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

// safeStorage's key lives in the app's own data folder, so the helper must use the same one.
// (Harmless "Unable to move the cache" lines may appear if the app is open at the same time.)
app.setPath('userData', join(app.getPath('appData'), 'HomeLibrary'))

const quote = (arg) => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg)

async function main() {
  let db
  try {
    db = JSON.parse(readFileSync(join(app.getPath('userData'), 'config.json'), 'utf8')).db
  } catch {
    db = null
  }
  if (!db) {
    process.stderr.write('No saved database login. Open the app once and complete the Connect screen.\n')
    app.exit(1)
    return
  }
  const { result: password } = await safeStorage.decryptStringAsync(Buffer.from(db.passwordEncrypted, 'base64'))
  const self = process.argv.findIndex((a) => resolve(a) === __filename)
  const args = process.argv.slice(self + 1)
  if (self < 0 || args.length === 0) throw new Error('Usage: electron scripts/with-db-env.cjs <command> [args…]')
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(args.map(quote).join(' '), {
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...env,
      PGHOST: db.host,
      PGPORT: String(db.port),
      PGUSER: db.user,
      PGPASSWORD: password,
      HOME_LIBRARY_REAL_DB: db.database
    }
  })
  child.stdout.on('data', (d) => process.stdout.write(d))
  child.stderr.on('data', (d) => process.stderr.write(d))
  child.on('exit', (code) => app.exit(code ?? 1))
}

app.whenReady().then(main).catch((err) => {
  process.stderr.write(`with-db-env failed: ${err.message}
`)
  app.exit(1)
})
