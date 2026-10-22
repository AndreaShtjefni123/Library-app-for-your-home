// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mapAuthor, mapEdition, mapSearchDoc, workSubjects, type OlSearchDoc } from '../../src/main/services/catalog/openLibrary'
import { mapVolume, mapVolumeResult, type GoogleVolume } from '../../src/main/services/catalog/googleBooks'
import { matchKey, mergeDetails, mergeResults, rankSuggestions } from '../../src/main/services/catalog/merge'
import { formatFrom, isoDateFrom, languageName, plainText, seriesFrom } from '../../src/main/services/catalog/text'
import { assertAllowed } from '../../src/main/services/net'
import { applyEdition, type CatalogResult } from '../../src/shared/catalog'

const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(join(__dirname, '../fixtures/catalog', name), 'utf8')) as T

const olDocs = fixture<{ docs: OlSearchDoc[] }>('ol-search-piranesi.json').docs
const google = fixture<{ items: GoogleVolume[] }>('google-search-piranesi.json').items

describe('cleaning catalogue text', () => {
  it('turns Google HTML into plain paragraphs', () => {
    expect(plainText('<p><b>Winner</b></p><p>Line one<br>Line two &amp; more</p>')).toBe('Winner\n\nLine one\nLine two & more')
  })

  it('turns Open Library Markdown into plain text and drops "Source:" footers', () => {
    const bio = { value: 'Susanna is an *English* author of **Piranesi**.\r\n\r\n**Source**: [Wikipedia](https://en.wikipedia.org)' }
    expect(plainText(bio)).toBe('Susanna is an English author of Piranesi.')
  })

  it('names languages, formats, dates and series', () => {
    expect(languageName('/languages/eng')).toBe('English')
    expect(languageName('sq')).toBe('Albanian')
    expect(formatFrom('Mass Market Paperback')).toBe('paperback')
    expect(formatFrom('Hardcover')).toBe('hardcover')
    expect(formatFrom('ebook')).toBe('ebook')
    expect(isoDateFrom('2020-09-15')).toBe('2020-09-15')
    expect(isoDateFrom('September 15, 2020')).toBe('2020-09-15')
    expect(isoDateFrom('2004')).toBe('2004')
    expect(isoDateFrom('c1999')).toBe('1999')
    expect(seriesFrom('Discworld ; 1')).toEqual({ name: 'Discworld', number: 1 })
    expect(seriesFrom('The Expanse #3')).toEqual({ name: 'The Expanse', number: 3 })
    expect(seriesFrom('Penguin classics')).toEqual({ name: 'Penguin classics', number: null })
  })
})

describe('Open Library', () => {
  it('maps search results with cover and edition count', () => {
    const piranesi = mapSearchDoc(olDocs[0])!
    expect(piranesi).toMatchObject({
      title: 'Piranesi',
      authors: ['Susanna Clarke'],
      firstPublishYear: 2020,
      ref: { olWorkKey: 'OL20893680W' }
    })
    expect(piranesi.editionCount).toBeGreaterThan(10)
    expect(piranesi.coverUrl).toMatch(/^https:\/\/covers\.openlibrary\.org\/b\/id\/\d+-L\.jpg/)
  })

  it('maps an edition with both ISBNs, language and pages', () => {
    const e = mapEdition(fixture('ol-isbn-9781526622426.json'))
    expect(e).toMatchObject({
      key: 'OL29486417M',
      title: 'Piranesi',
      publisher: 'Bloomsbury Publishing Plc',
      pubDate: '2020',
      pages: 272,
      language: 'English',
      isbn13: '9781526622426',
      isbn10: '1526622424'
    })
  })

  it('maps an author with a cleaned biography and a photo', () => {
    const a = mapAuthor(fixture('ol-author-OL1387961A.json'))!
    expect(a.name).toBe('Susanna Clarke')
    expect(a.birthDate).toBe('01 November 1959')
    expect(a.bio).toMatch(/^Susanna Mary Clarke/)
    expect(a.bio).not.toMatch(/\*\*|Source/)
    expect(a.photoUrl).toMatch(/covers\.openlibrary\.org\/a\/id\/7284260-L\.jpg/)
  })

  it('keeps real subjects and drops list codes', () => {
    const subjects = workSubjects({ key: 'x', subjects: ['Fantasy', 'fantasy', 'nyt:hardcover-fiction=2020-09-27', 'Labyrinths'] })
    expect(subjects).toEqual(['Fantasy', 'Labyrinths'])
  })
})

describe('Google Books', () => {
  it('maps a volume, upgrading the cover to https and splitting categories', () => {
    const v = mapVolume(google[0])!
    expect(v).toMatchObject({
      title: 'Piranesi',
      isbn13: '9781526622426',
      isbn10: '1526622424',
      pages: 272,
      language: 'English',
      ratingAvg: 4.5,
      ratingCount: 128,
      categories: ['Fiction', 'Fantasy', 'Literary']
    })
    expect(v.coverUrl).toMatch(/^https:\/\/books\.google\.com/)
    expect(v.coverUrl).not.toContain('edge=curl')
    expect(v.description).toContain('A house of endless halls & tides.')
  })
})

describe('merging both catalogues', () => {
  it('treats "The Hobbit" and "Hobbit" by the same author as one book', () => {
    expect(matchKey('The Hobbit', ['J.R.R. Tolkien'])).toBe(matchKey('Hobbit', ['J. R. R. Tolkien']))
  })

  it('folds the Google result into the Open Library one and keeps unmatched ones', () => {
    const ol = olDocs.map(mapSearchDoc).filter((r): r is CatalogResult => r !== null)
    const g = google.map(mapVolumeResult).filter((r): r is CatalogResult => r !== null)
    const merged = mergeResults(ol, g)
    const piranesi = merged.filter((r) => r.title === 'Piranesi' && r.authors[0] === 'Susanna Clarke')
    expect(piranesi).toHaveLength(1)
    expect(piranesi[0].sources).toEqual(['openlibrary', 'google'])
    expect(piranesi[0].ref.googleId).toBe('pirnGoogle01')
    expect(merged.some((r) => r.title === 'Jonathan Strange & Mr Norrell')).toBe(true)
  })

  it('builds one complete book: longest description, Google rating, Open Library authors', () => {
    const book = mergeDetails({
      work: fixture('ol-work-OL20893680W.json'),
      edition: fixture('ol-isbn-9781526622426.json'),
      authors: [mapAuthor(fixture('ol-author-OL1387961A.json'))!],
      ratings: fixture<{ summary: { average: number; count: number } }>('ol-ratings-OL20893680W.json').summary,
      editionCount: 23,
      google: mapVolume(google[0]),
      googleId: 'pirnGoogle01'
    })!
    expect(book).toMatchObject({
      title: 'Piranesi',
      isbn13: '9781526622426',
      publisher: 'Bloomsbury Publishing Plc',
      pages: 272,
      firstPublishedYear: 2020,
      ratingAvg: 4.5,
      ratingCount: 128,
      genres: ['Fiction', 'Fantasy', 'Literary'],
      editionCount: 23,
      sources: ['openlibrary', 'google']
    })
    expect(book.contributors.map((c) => c.name)).toEqual(['Susanna Clarke'])
    expect(book.description!.length).toBeGreaterThan(400)
    expect(book.links.map((l) => l.label)).toEqual(['Open Library', 'Google Books'])
  })

  it('switching edition swaps ISBN, publisher and cover but keeps the story', () => {
    const book = mergeDetails({
      work: fixture('ol-work-OL20893680W.json'),
      edition: fixture('ol-isbn-9781526622426.json'),
      authors: [],
      ratings: null,
      editionCount: null,
      google: null,
      googleId: null
    })!
    const other = mapEdition(fixture<{ entries: never[] }>('ol-editions-OL20893680W.json').entries[1])
    const swapped = applyEdition(book, other)
    expect(swapped.isbn13).toBe(other.isbn13)
    expect(swapped.publisher).toBe(other.publisher)
    expect(swapped.description).toBe(book.description)
    expect(swapped.ref.olEditionKey).toBe(other.key)
  })
})

describe('internet allow-list', () => {
  it('only allows the book catalogues, over https', () => {
    expect(() => assertAllowed('https://openlibrary.org/search.json?q=x')).not.toThrow()
    expect(() => assertAllowed('https://evil.example.com/x')).toThrow(/Not an allowed/)
    expect(() => assertAllowed('http://openlibrary.org/x')).toThrow(/Not an allowed/)
  })
})

describe('suggestions while typing', () => {
  const r = (title: string, author: string, editionCount = 1): CatalogResult => ({
    ref: { olWorkKey: title },
    title,
    subtitle: null,
    authors: [author],
    firstPublishYear: null,
    editionCount,
    pages: null,
    coverUrl: null,
    sources: ['openlibrary'],
    inLibraryId: null
  })

  it('treats the last word as unfinished and puts titles that start with the text first', () => {
    const ranked = rankSuggestions(
      [r('Treasure Island', 'Stevenson', 900), r('How to be a pirate', 'Cowell'), r('Piranesi', 'Susanna Clarke', 23)],
      'pira',
      8
    )
    expect(ranked.map((x) => x.title)).toEqual(['Piranesi', 'How to be a pirate'])
  })

  it('understands author + title words together', () => {
    const ranked = rankSuggestions([r('Hobbits of Tolkien', 'David Day'), r('The Hobbit', 'J.R.R. Tolkien', 400)], 'tolkien hob', 8)
    expect(ranked[0].title).toBe('The Hobbit')
  })

  it('prefers the book itself over long collections and guides', () => {
    const ranked = rankSuggestions(
      [r('The Left Hand of Darkness/The Word for World Is Forest/The Dispossessed', 'Ursula K. Le Guin'), r('The Left Hand of Darkness', 'Ursula K. Le Guin', 120)],
      'the left hand of darkn',
      8
    )
    expect(ranked[0].title).toBe('The Left Hand of Darkness')
  })

  it('ignores accents and capitals', () => {
    expect(rankSuggestions([r('Cien años de soledad', 'García Márquez')], 'cien anos de sol', 8)).toHaveLength(1)
  })
})
