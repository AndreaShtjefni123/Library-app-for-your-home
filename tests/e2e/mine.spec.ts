import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type pg from 'pg'
import { freshDatabase, hasDb } from '../helpers/testDb'
import { createBook } from '../../src/main/db/repos/editions'
import { setReadingStatus } from '../../src/main/db/repos/shelves'

// Milestone 3 ("Make it yours") end to end, on a throwaway database.
const shots = process.env.SCREENSHOT_DIR

test.skip(!hasDb, 'needs the database login: run `npm run test:e2e:db`')
test.describe.configure({ mode: 'serial' })

let app: ElectronApplication
let page: Page
let pool: pg.Pool
let dataDir: string
let piranesi: string
let idle: string

const shot = async (name: string): Promise<void> => {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) })
}
const sidebar = (): ReturnType<Page['getByRole']> => page.getByRole('navigation', { name: 'Main' })
const openBook = async (id: string): Promise<void> => {
  await page.evaluate((bookId) => (window.location.hash = `#/book/${bookId}`), id)
  await expect(page.getByTestId('your-book')).toBeVisible()
}

test.beforeAll(async () => {
  pool = await freshDatabase('home_library_e2e_mine')
  piranesi = await createBook(pool, {
    title: 'Piranesi',
    contributors: [{ name: 'Susanna Clarke', role: 'author' }],
    pages: 272,
    ownership: 'owned'
  })
  idle = await createBook(pool, { title: 'The Long Middle', contributors: [], pages: 400, ownership: 'owned' })
  await setReadingStatus(pool, { id: idle, status: 'reading', currentPage: 120 })
  // Pretend nothing has happened on it for 45 days.
  await pool.query(
    "UPDATE reading_status SET updated_at = now() - interval '45 days', last_read_at = now() - interval '45 days' WHERE edition_id = $1",
    [idle]
  )
  dataDir = mkdtempSync(join(tmpdir(), 'home-library-e2e-'))
  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, HOME_LIBRARY_USER_DATA: dataDir, HOME_LIBRARY_DB_FROM_ENV: '1', PGDATABASE: 'home_library_e2e_mine' } as Record<
      string,
      string
    >
  })
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1360, height: 900 })
  await page.getByTestId('splash').click()
  await expect(page.getByTestId('splash')).toBeHidden({ timeout: 15_000 })
})

test.afterAll(async () => {
  await app?.close()
  await pool?.end()
  rmSync(dataDir, { recursive: true, force: true })
})

test('books without a picture get a designed cover', async () => {
  await openBook(piranesi)
  await expect(page.locator('[data-cover-layout]').first()).toBeVisible()
})

test('rate a book in half stars', async () => {
  await page.getByRole('button', { name: '4.5 stars' }).click()
  await expect(page.getByTestId('star-rating').first()).toHaveAttribute('aria-valuenow', '4.5')
})

test('your page: bought-on date, Hardcover/Paperback and your thoughts save by themselves', async () => {
  const mine = page.getByTestId('your-book')
  await expect(mine).toBeVisible()
  await mine.getByLabel(/Bought \/ received on/).fill('2023-12-24')
  await expect(mine.getByTestId('format-select').locator('option')).toHaveText(['—', 'Hardcover', 'Paperback'])
  await mine.getByTestId('format-select').selectOption('hardcover')
  await mine.getByTestId('my-thoughts').fill('Strange and wonderful.')
  await expect(mine.getByText('Saved').first()).toBeVisible()
  // None of the removed details are offered any more.
  for (const gone of ['Where it is', 'Condition', 'Where from', 'Price', 'Currency', 'A gift from', 'Signed copy', 'Private notes', 'Tags']) {
    await expect(mine.getByText(gone, { exact: true })).toHaveCount(0)
  }
  await shot('m3-your-page')
  // Still there after leaving and coming back.
  await openBook(idle)
  await openBook(piranesi)
  await expect(page.getByTestId('format-select')).toHaveValue('hardcover')
  await expect(page.getByTestId('my-thoughts')).toHaveValue('Strange and wonderful.')
})

test('Book info shows everything about the book, with the website rating', async () => {
  await page.getByRole('button', { name: 'Book info' }).click()
  const info = page.getByTestId('book-info')
  await expect(info).toBeVisible()
  await expect(info).toContainText('272')
  await expect(page.getByTestId('website-rating')).toContainText('No online rating')
  await expect(page.getByTestId('star-rating')).toHaveCount(0)
  await shot('m3-book-info')
  await page.getByRole('button', { name: 'My book' }).click()
  await expect(page.getByTestId('your-book')).toBeVisible()
})

test('change the cover from a file, then undo it', async () => {
  await page.getByLabel('Choose a cover picture').setInputFiles(join(__dirname, '../fixtures/catalog/cover-13011435.jpg'))
  const cover = page.locator('img[src^="cover://books/"]')
  await expect(cover).toBeVisible()
  expect(await cover.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(50)
  await shot('m3-new-cover')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('img[src^="cover://books/"]')).toHaveCount(0)
  await expect(page.locator('[data-cover-layout]').first()).toBeVisible()
})

test('quotes can be added and reordered on your page', async () => {
  for (const [text, pg] of [
    ['The Beauty of the House is immeasurable', '5'],
    ['Its Kindness infinite.', '6']
  ]) {
    await page.getByRole('button', { name: 'Add a quote' }).click()
    await page.getByLabel('Quote', { exact: true }).fill(text)
    await page.getByLabel('Page').fill(pg)
    await page.getByRole('button', { name: 'Add quote' }).click()
  }
  const quotes = page.getByTestId('quotes').locator('blockquote')
  await expect(quotes).toHaveCount(2)
  await page.getByRole('button', { name: 'Move up' }).nth(1).click()
  await expect(quotes.first()).toHaveText('Its Kindness infinite.')
})

test('log progress by page; reaching the end offers "Mark as read"', async () => {
  await page.getByRole('radio', { name: 'Currently reading' }).click()
  await page.getByRole('button', { name: 'Log progress' }).first().click()
  await page.getByLabel(/Page you.re on/).fill('136')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('page 136 of 272 · 50%')).toBeVisible()
  await expect(page.getByTestId('reading-log')).toContainText('Reached page 136 of 272')
  await shot('m3-reading-log')

  await page.getByRole('button', { name: 'Log progress' }).click()
  await page.getByLabel(/Page you.re on/).fill('272')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Mark as read' }).click()
  await expect(page.getByRole('radio', { name: 'Read', exact: true })).toHaveAttribute('aria-checked', 'true')
})

test('"Haven’t read this in a while?" after 30 days without progress', async () => {
  await openBook(idle)
  const banner = page.getByTestId('stale-suggestion')
  await expect(banner).toContainText('No progress in 45 days')
  await shot('m3-stale')
  await banner.getByRole('button', { name: 'Still reading' }).click()
  await expect(banner).toHaveCount(0)
})

test('choose the made-up cover design in Settings', async () => {
  await sidebar().getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('radio', { name: 'Framed plate' }).click()
  await shot('m3-settings')
  await openBook(idle)
  await expect(page.locator('[data-cover-layout="plate"]').first()).toBeVisible()
})
