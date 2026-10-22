import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import electronPath from 'electron'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Runs the built app (npm run build first) with an empty, temporary data folder,
// so it behaves like a brand-new install and never touches your real settings.
let app: ElectronApplication
let page: Page
let dataDir: string

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'home-library-e2e-'))
  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, HOME_LIBRARY_USER_DATA: dataDir }
  })
  page = await app.firstWindow()
})

test.afterAll(async () => {
  await app?.close()
  rmSync(dataDir, { recursive: true, force: true })
})

test('opens with the animated title, then the first-run setup', async () => {
  await expect(page).toHaveTitle("Home Library")
  await expect(page.getByTestId('splash')).toBeVisible()
  await page.getByTestId('splash').click()
  await expect(page.getByTestId('splash')).toBeHidden({ timeout: 10_000 })
  await expect(page.getByRole('heading', { name: 'Connect your library' })).toBeVisible()
  await expect(page.getByLabel('Database')).toHaveValue("Home Library")
})

test('the app window cannot reach the internet', async () => {
  const result = await page.evaluate(async () => {
    try {
      await fetch('https://example.com')
      return 'reached'
    } catch {
      return 'blocked'
    }
  })
  expect(result).toBe('blocked')
})

test('a second launch does not open a second window', async () => {
  // Start a second copy directly (Playwright can't attach to an app that quits at once).
  const second = spawn(electronPath, ['.'], { env: { ...process.env, HOME_LIBRARY_USER_DATA: dataDir } })
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      second.kill()
      reject(new Error('The second copy kept running'))
    }, 15_000)
    second.on('exit', (code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })
  expect(exitCode).toBe(0)
  expect(app.windows()).toHaveLength(1)
})
