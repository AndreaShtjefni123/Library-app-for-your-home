import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type pg from 'pg'
import { freshDatabase, hasDb } from '../helpers/testDb'

// Milestone 2 end to end: search, preview, pick an edition, add to a shelf, then go offline.
// The catalogues' answers come from saved files (tests/fixtures/catalog), never the real internet.
const shots = process.env.SCREENSHOT_DIR

test.skip(!hasDb, 'needs the database login: run `npm run test:e2e:db`')
test.describe.configure({ mode: 'serial' })

let app: ElectronApplication
let page: Page
let pool: pg.Pool
let dataDir: string
let netDir: string

const sidebar = (): ReturnType<Page['getByRole']> => page.getByRole('navigation', { name: 'Main' })
const shot = async (name: string): Promise<void> => {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) })
}
const search = async (text: string): Promise<void> => {
  await page.getByLabel('Search for a book').fill(text)
  await page.getByLabel('Search for a book').press('Escape')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
}

test.beforeAll(async () => {
  pool = await freshDatabase('home_library_e2e_discover')
  dataDir = mkdtempSync(join(tmpdir(), 'home-library-e2e-'))
  netDir = mkdtempSync(join(tmpdir(), 'home-library-net-'))
  cpSync(join(__dirname, '../fixtures/catalog'), netDir, { recursive: true })
  app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      HOME_LIBRARY_USER_DATA: dataDir,
      HOME_LIBRARY_DB_FROM_ENV: '1',
      PGDATABASE: 'home_library_e2e_discover',
      HOME_LIBRARY_FAKE_NET: netDir
    } as Record<string, string>
  })
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1360, height: 860 })
  await page.getByTestId('splash').click()
  await expect(page.getByTestId('splash')).toBeHidden({ timeout: 15_000 })
})

test.afterAll(async () => {
  await app?.close()
  await pool?.end()
  rmSync(dataDir, { recursive: true, force: true })
  rmSync(netDir, { recursive: true, force: true })
})

test('suggests books while typing', async () => {
  await sidebar().getByRole('link', { name: 'Discover' }).click()
  await expect(page.getByTestId('online-pill')).toContainText('Online')
  await page.getByLabel('Search for a book').pressSequentially('Pira', { delay: 40 })
  const suggestions = page.getByTestId('suggestions')
  await expect(suggestions.getByRole('option', { name: /Piranesi.*Susanna Clarke/ }).first()).toBeVisible()
  const thumb = suggestions.locator('img').first()
  await expect(thumb).toBeVisible()
  expect(await thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(20)
  await shot('m2-suggestions')
})

test('opening a suggestion shows the cover and every detail', async () => {
  await page.getByTestId('suggestions').getByRole('option', { name: /Piranesi.*Susanna Clarke/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Piranesi', level: 1 })).toBeVisible()
  await expect(page.getByText(/Piranesi's house is no ordinary building/)).toBeVisible()
  await expect(page.getByText(/Susanna Mary Clarke/)).toBeVisible()
  await expect(page.getByText('4.5')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Pick your edition/ })).toBeVisible()

  const editions = page.getByTestId('editions').getByRole('button')
  await editions.nth(1).click()
  await expect(editions.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await editions.first().click()
})

test('Save opens your shelves and saves to the one you pick', async () => {
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const panel = page.getByTestId('save-panel')
  await expect(panel.getByRole('menuitem')).toHaveCount(4)
  await shot('m2-save-panel')
  await panel.getByRole('menuitem', { name: /To-read pile/ }).click()
  const saved = page.getByRole('link', { name: /Piranesi is in your library/ })
  await expect(saved).toContainText('Saved to To-read pile')
  await expect(sidebar().getByRole('link', { name: /To-read pile/ })).toContainText('1')

  await saved.click()
  await expect(page.getByRole('radio', { name: 'To-read pile' })).toHaveAttribute('aria-checked', 'true')
  const cover = page.locator('img[src^="cover://books/"]')
  await expect(cover).toBeVisible()
  expect(await cover.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(50)
})

test('full results: books you have are marked, others can be saved straight from the card', async () => {
  await sidebar().getByRole('link', { name: 'Discover' }).click()
  await search('Piranesi')
  const results = page.getByTestId('search-results')
  await expect(results.getByText('In your library').first()).toBeVisible()
  await shot('m2-results')
  const strange = results.locator('li', { hasText: 'Jonathan Strange & Mr Norrell' })
  await strange.getByRole('button', { name: 'Save', exact: true }).click()
  const panel = page.getByTestId('save-panel')
  // The shelf panel now shows Piranesi's cover on To-read pile.
  await expect(panel.getByRole('menuitem', { name: /To-read pile/ })).toContainText('1 book')
  await panel.getByRole('menuitem', { name: /Want to buy/ }).click()
  await expect(strange.getByText('Saved to Want to buy')).toBeVisible()
  await expect(sidebar().getByRole('link', { name: /Want to buy/ })).toContainText('1')
})

test('explains when Google refuses, and keeps going with Open Library', async () => {
  writeFileSync(
    join(netDir, 'fake-net.json'),
    JSON.stringify([
      { match: 'openlibrary.org/search.json', file: 'ol-search-piranesi.json' },
      { match: 'www.googleapis.com', status: 429 }
    ])
  )
  await search('clarke piranesi')
  await expect(page.getByText(/Google Books is refusing requests/)).toBeVisible()
  await expect(page.getByTestId('search-results').getByText('Piranesi', { exact: true }).first()).toBeVisible()
})

test('offline: says so, offers adding by hand, and saved books still show fully', async () => {
  writeFileSync(join(netDir, 'OFFLINE'), '')
  await search('9780747570554')
  await expect(page.getByText(/You.re offline/)).toBeVisible()
  await shot('m2-offline')
  await page.getByRole('button', { name: 'Add it by hand' }).click()
  await expect(page.getByLabel('ISBN')).toHaveValue('9780747570554')

  await sidebar().getByRole('link', { name: /To-read pile/ }).click()
  await page.getByTestId('book-grid').locator('a').first().click()
  await page.getByRole('button', { name: 'Book info' }).click()
  await expect(page.getByText(/Piranesi's house is no ordinary building/)).toBeVisible()
  // The website's rating (from Google Books), not your own stars.
  await expect(page.getByTestId('website-rating')).toContainText('4.5')
  await page.getByRole('button', { name: 'My book' }).click()
  await expect(page.locator('img[src^="cover://books/"]')).toBeVisible()
})

test('deleting a book burns it away, and Undo brings it back', async () => {
  // Continues on Piranesi's page from the previous test (saved cover shown).
  rmSync(join(netDir, 'OFFLINE'), { force: true })
  // Freeze time so the fire can be photographed at exact moments, then let it finish.
  await page.clock.install()
  await page.clock.pauseAt(Date.now() + 1000)
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByTestId('burn')).toHaveAttribute('data-burning', 'true')
  // The realistic fire is drawn on the graphics card (WebGL).
  await expect(page.getByTestId('burn')).toHaveAttribute('data-fire', 'webgl')
  const canvas = page.getByTestId('burn-canvas')
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  for (const t of [400, 800, 1200, 1600, 2000, 2400]) {
    await page.clock.runFor(400)
    if (shots && box) await page.screenshot({ path: join(shots, `m2-fire-${t}.png`), clip: box })
  }
  await page.clock.runFor(2000)
  await page.clock.resume()
  await expect(page.getByText('“Piranesi” went up in flames')).toBeVisible({ timeout: 8000 })
  await expect(sidebar().getByRole('link', { name: /To-read pile/ })).not.toContainText('1')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('Book restored')).toBeVisible()
  await expect(sidebar().getByRole('link', { name: /To-read pile/ })).toContainText('1')
})

test('pointing at a book on a shelf turns it in 3D', async () => {
  await sidebar().getByRole('link', { name: /To-read pile/ }).click()
  const tile = page.getByTestId('book-grid').locator('.book-tile').first()
  await expect(tile).toBeVisible()
  const box = (await tile.locator('.book-stage').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.3)
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.25, { steps: 5 })
  await page.waitForTimeout(700)
  const transform = await tile.locator('.book').evaluate((el) => getComputedStyle(el).transform)
  expect(transform).not.toBe('none')
  if (shots) await page.screenshot({ path: join(shots, 'm2-hover.png'), clip: { x: box.x - 60, y: box.y - 60, width: box.width + 160, height: box.height + 140 } })
  await page.mouse.move(5, 5)
})
