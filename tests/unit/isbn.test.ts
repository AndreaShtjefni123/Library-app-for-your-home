// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isbn10To13, isbn13To10, isValidIsbn, isValidIsbn10, isValidIsbn13, splitIsbn } from '../../src/shared/isbn'
import { sortName, sortTitle } from '../../src/shared/sorting'

describe('ISBN', () => {
  it('accepts valid ISBN-13s, with or without hyphens', () => {
    expect(isValidIsbn13('9781526622426')).toBe(true)
    expect(isValidIsbn13('978-0-14-143951-8')).toBe(true)
  })

  it('rejects a wrong check digit', () => {
    expect(isValidIsbn13('9781526622427')).toBe(false)
    expect(isValidIsbn10('0141439518')).toBe(false)
  })

  it('handles ISBN-10s ending in X', () => {
    expect(isValidIsbn10('080442957X')).toBe(true)
    expect(isValidIsbn10('080442957x')).toBe(true)
  })

  it('converts between ISBN-10 and ISBN-13', () => {
    expect(isbn10To13('0141439513')).toBe('9780141439518')
    expect(isbn13To10('9780141439518')).toBe('0141439513')
    expect(isbn13To10('9791234567896')).toBeNull()
  })

  it('splits any valid ISBN into both forms', () => {
    expect(splitIsbn('0-14-143951-3')).toEqual({ isbn13: '9780141439518', isbn10: '0141439513' })
    expect(splitIsbn('nonsense')).toBeNull()
    expect(isValidIsbn('')).toBe(false)
  })
})

describe('sorting', () => {
  it('ignores leading articles in titles', () => {
    expect(sortTitle('The Hobbit')).toBe('hobbit')
    expect(sortTitle('A Wizard of Earthsea')).toBe('wizard of earthsea')
    expect(sortTitle('Theory of Everything')).toBe('theory of everything')
  })

  it('files authors under their surname', () => {
    expect(sortName('Susanna Clarke')).toBe('Clarke, Susanna')
    expect(sortName('Ursula K. Le Guin')).toBe('Le Guin, Ursula K.')
    expect(sortName('Ludwig van Beethoven')).toBe('van Beethoven, Ludwig')
    expect(sortName('Martin Luther King Jr.')).toBe('King, Martin Luther Jr.')
    expect(sortName('Tolkien, J.R.R.')).toBe('Tolkien, J.R.R.')
    expect(sortName('Homer')).toBe('Homer')
  })
})
