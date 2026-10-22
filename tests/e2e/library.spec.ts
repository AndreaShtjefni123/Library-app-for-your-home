import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type pg from 'pg'
import { freshDatabase, hasDb } from '../helpers/testDb'
import { createBook } from '../../src/main/db/repos/editions'

// Milestone 1 end to end, against a throwaway database (run with `npm run test:e2e:db`).
// Screenshots go to SCREENSHOT_DIR when set, for a visual check.
const shots = process.env.SCREENSHOT_DIR

test.skip(!hasDb, 'needs the database login: run `npm run test:e2e:db`')
test.describe.configure({ mode: 'serial' })

let app: ElectronApplication
let page: Page
let dataDir: string
let pool: pg.Pool

async function launch(database: string): Promise<void> {
  dataDir = mkdtempSync(join(tmpdir(), 'home-library-e2e-'))
  app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      HOME_LIBRARY_USER_DATA: dataDir,
      HOME_LIBRARY_DB_FROM_ENV: '1',
      PGDATABASE: database
    } as Record<string, string>
  })
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1360, height: 860 })
  await page.getByTestId('splash').click()
  await expect(page.getByTestId('splash')).toBeHidden({ timeout: 15_000 })
}

async function shot(name: string): Promise<void> {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) })
}

const sidebar = (): ReturnType<Page['getByRole']> => page.getByRole('navigation', { name: 'Main' })

test.describe('adding and managing books', () => {
  test.beforeAll(async () => {
    pool = await freshDatabase('home_library_e2e')
    await createBook(pool, { title: 'The Hobbit', contributors: [{ name: 'J.R.R. Tolkien', role: 'author' }], pages: 310, ownership: 'owned', readingStatus: 'read' })
    await createBook(pool, { title: 'Piranesi', contributors: [{ name: 'Susanna Clarke', role: 'author' }], pages: 272, ownership: 'owned' })
    await createBook(pool, { title: 'Circe', contributors: [{ name: 'Madeline Miller', role: 'author' }], ownership: 'wishlist' })
    await launch('home_library_e2e')
  })

  test.afterAll(async () => {
    await app?.close()
    await pool?.end()
    rmSync(dataDir, { recursive: true, force: true })
  })

  test('the Library lists books from PostgreSQL, with shelf counts', async () => {
    await sidebar().getByRole('link', { name: /Library/ }).click()
    await expect(page.getByText('3 books')).toBeVisible()
    await expect(page.getByTestId('book-grid').getByText('Piranesi').first()).toBeVisible()
    await expect(sidebar().getByRole('link', { name: /Want to buy/ })).toContainText('1')
  })

  test('adds a book by hand, catching a bad ISBN', async () => {
    await sidebar().getByRole('link', { name: 'Discover' }).click()
    await page.getByRole('link', { name: 'or add one by hand' }).click()
    await page.getByLabel('Title *').fill('Jonathan Strange & Mr Norrell')
    await page.getByLabel('Person 1 name').fill('Susanna Clarke')
    await page.getByLabel('ISBN').fill('978-0-7475-7055-1')
    await page.getByLabel('Pages').fill('782')
    await page.getByLabel('Published').fill('2004')
    await page.getByRole('button', { name: 'Add to library' }).click()
    await expect(page.getByText(/ISBN doesn.t check out/)).toBeVisible()
    await shot('m1-add-form-error')
    await page.getByLabel('ISBN').fill('978-0-7475-7055-4')
    await page.getByLabel('Reading').selectOption('reading')
    await page.getByRole('button', { name: 'Add to library' }).click()
    await expect(page.getByRole('heading', { name: 'Jonathan Strange & Mr Norrell' })).toBeVisible()
    await expect(page.getByTestId('your-book')).toBeVisible()
    await page.getByRole('button', { name: 'Book info' }).click()
    await expect(page.getByText('9780747570554')).toBeVisible()
    await shot('m1-book-detail')
  })

  test('warns about duplicates and can add another copy', async () => {
    await page.goto(page.url().replace(/#.*$/, '#/add'))
    await page.getByLabel('Title *').fill('Hobbit')
    await page.getByLabel('Person 1 name').fill('JRR Tolkien')
    await page.getByRole('button', { name: 'Add to library' }).click()
    const dialog = page.getByRole('dialog', { name: 'You may already have this book' })
    await expect(dialog).toBeVisible()
    await shot('m1-duplicate')
    await dialog.getByRole('button', { name: 'Add another copy' }).click()
    await expect(page.getByRole('heading', { name: 'The Hobbit' })).toBeVisible()
    await expect(page.getByText('Added another copy')).toBeVisible()
  })

  test('edits a book', async () => {
    await page.getByRole('button', { name: 'Edit' }).click()
    await page.getByLabel('Pages').fill('320')
    await page.getByLabel('Subtitle').fill('There and Back Again')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('There and Back Again')).toBeVisible()
    await page.getByRole('button', { name: 'Book info' }).click()
    await expect(page.getByTestId('book-info')).toContainText('320 pages')
  })

  test('Partly read: note where you stopped, then resume', async () => {
    await sidebar().getByRole('link', { name: /Library/ }).click()
    await page.getByTestId('book-grid').getByText('Piranesi').first().click()
    await page.getByRole('radio', { name: 'Partly read' }).click()
    await page.getByLabel('Page (of 272)').fill('204')
    await page.getByLabel('Where I stopped (optional)').fill('Stopped at the drowned halls')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('page 204 of 272 · 75%')).toBeVisible()

    await sidebar().getByRole('link', { name: /Partly read/ }).click()
    const list = page.getByTestId('partly-read-list')
    await expect(list.getByRole('link', { name: 'Piranesi', exact: true })).toBeVisible()
    await expect(list.getByText(/Stopped at the drowned halls/)).toBeVisible()
    await shot('m1-partly-read')
    await list.getByRole('button', { name: 'Resume' }).click()
    await expect(page.getByText(/Nothing here/)).toBeVisible()
    await expect(sidebar().getByRole('link', { name: /Currently reading/ })).toContainText('2')
  })

  test('deletes a book and brings it back with Undo', async () => {
    await sidebar().getByRole('link', { name: /Want to buy/ }).click()
    await page.getByTestId('book-grid').getByText('Circe').first().click()
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('“Circe” went up in flames')).toBeVisible({ timeout: 8000 })
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByText('Book restored')).toBeVisible()
    await expect(sidebar().getByRole('link', { name: /Want to buy/ })).toContainText('1')
  })

  test('list view sorts by column', async () => {
    await sidebar().getByRole('link', { name: /Library/ }).click()
    await page.getByRole('radio', { name: 'List view' }).click()
    const table = page.getByTestId('book-table')
    await table.getByRole('button', { name: 'Pages' }).click()
    const firstRow = table.getByRole('row').nth(1)
    await expect(firstRow).toContainText('Jonathan Strange')
    await page.getByRole('radio', { name: 'Grid view' }).click()
  })
})

test.describe('a big library', () => {
  test.skip(!shots, 'visual tour only runs when SCREENSHOT_DIR is set')

  test.beforeAll(async () => {
    await launch('home_library_demo')
  })

  test.afterAll(async () => {
    await app?.close()
    rmSync(dataDir, { recursive: true, force: true })
  })

  test('scrolls through 1,000 books smoothly in grid and list', async () => {
    await sidebar().getByRole('link', { name: /Library/ }).click()
    await expect(page.getByText('1,000 books')).toBeVisible()
    await shot('m1-grid-1000')
    const tiles = await page.getByTestId('book-grid').locator('a').count()
    expect(tiles).toBeLessThan(200) // only what's on screen is drawn
    await page.locator('main').evaluate((m) => m.scrollTo(0, m.scrollHeight))
    await expect(page.getByTestId('book-grid').locator('a').last()).toBeVisible()
    await page.getByRole('radio', { name: 'List view' }).click()
    await page.locator('main').evaluate((m) => m.scrollTo(0, 0))
    await shot('m1-list-1000')
    await page.getByRole('radio', { name: 'Grid view' }).click()
    await sidebar().getByRole('link', { name: /Partly read/ }).click()
    await expect(page.getByTestId('partly-read-list')).toBeVisible()
    await shot('m1-partly-read-demo')
    await page.getByRole('button', { name: 'Switch to dark mode' }).click()
    await sidebar().getByRole('link', { name: /Library/ }).click()
    await expect(page.getByTestId('book-grid').locator('a').first()).toBeVisible()
    await shot('m1-grid-dark')
    await page.getByTestId('book-grid').locator('a').first().click()
    await expect(page.getByTestId('your-book')).toBeVisible()
    await shot('m1-detail-dark')
    await page.getByRole('button', { name: 'Switch to light mode' }).click()
  })
})
