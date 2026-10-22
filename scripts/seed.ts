// Fills a separate practice database with fake books, to try the app with a big library.
// Never touches your real "Home Library". Run with: npm run seed:demo -- 1000
import { freshDatabase } from '../tests/helpers/testDb'
import { createBook } from '../src/main/db/repos/editions'
import { setReadingStatus } from '../src/main/db/repos/shelves'
import type { BookFormat, BookInput, ReadingStatus } from '../src/shared/books'

const firstWords = ['The', 'A', '', '', '']
const adjectives = ['Silent', 'Hidden', 'Last', 'Golden', 'Broken', 'Distant', 'Winter', 'Secret', 'Burning', 'Quiet', 'Lost', 'Little', 'Endless', 'Paper', 'Glass', 'Northern', 'Midnight', 'Painted', 'Wild', 'Forgotten']
const nouns = ['Garden', 'River', 'House', 'Library', 'Orchard', 'Kingdom', 'Map', 'Lighthouse', 'Letters', 'Harbour', 'Clockmaker', 'Island', 'Forest', 'Atlas', 'Sea', 'Mountain', 'Tower', 'Bridge', 'Journey', 'Museum']
const givenNames = ['Elena', 'Marco', 'Sofia', 'James', 'Amara', 'Luca', 'Ingrid', 'Noah', 'Mei', 'Tomás', 'Ada', 'Kofi', 'Hana', 'Oliver', 'Zara', 'Felix', 'Iris', 'Mateo', 'Yuki', 'Rosa']
const familyNames = ['Hart', 'Moreau', 'Okafor', 'Lindqvist', 'Bianchi', 'Castillo', 'Nakamura', 'Ferreira', 'Albright', 'Novak', 'Haddad', 'Kowalski', 'Le Guin', 'Andersen', 'Byrne', 'Mendes', 'Varga', 'Sato', 'Quinn', 'Rahman']
const publishers = ['Harbour Press', 'Lantern Books', 'Northwind', 'Quill & Ink', 'Atlas House', 'Juniper']
const formats: BookFormat[] = ['paperback', 'paperback', 'hardcover', 'hardcover', 'ebook', 'audiobook']
const statuses: (ReadingStatus | null)[] = ['read', 'read', 'read', 'want', 'want', 'reading', 'partly_read', 'dnf', null, null]

let seed = 42
const rand = (): number => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)]

async function main(): Promise<void> {
  const count = Number(process.argv[2] ?? 1000)
  const name = process.argv[3] ?? 'home_library_demo'
  const pool = await freshDatabase(name)
  for (let i = 0; i < count; i++) {
    const title = [pick(firstWords), pick(adjectives), pick(nouns)].filter(Boolean).join(' ') + (rand() < 0.15 ? ` ${i}` : '')
    const pages = 120 + Math.floor(rand() * 600)
    const input: BookInput = {
      title,
      contributors: [{ name: `${pick(givenNames)} ${pick(familyNames)}`, role: 'author' }],
      publisher: pick(publishers),
      pubDate: String(1950 + Math.floor(rand() * 75)),
      pages,
      format: pick(formats),
      language: 'English',
      description: `A practice book, number ${i + 1}.`,
      ownership: rand() < 0.85 ? 'owned' : 'wishlist'
    }
    const id = await createBook(pool, input)
    const status = pick(statuses)
    if (status === 'partly_read') {
      await setReadingStatus(pool, { id, status, currentPage: Math.floor(pages * (0.4 + rand() * 0.55)), note: rand() < 0.5 ? 'Stopped at a chapter break' : null })
    } else if (status) {
      await setReadingStatus(pool, { id, status })
    }
    if ((i + 1) % 250 === 0) console.log(`${i + 1} books…`)
  }
  await pool.end()
  console.log(`Done: ${count} practice books in "${name}".`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
