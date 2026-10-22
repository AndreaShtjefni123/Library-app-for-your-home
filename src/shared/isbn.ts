// ISBN helpers. ISBN-10 uses a mod-11 check digit (may be X); ISBN-13 uses mod-10.

/** Removes spaces, hyphens and other separators; upper-cases a trailing x. */
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[^0-9Xx]/g, '').toUpperCase()
}

export function isValidIsbn10(raw: string): boolean {
  const isbn = normalizeIsbn(raw)
  if (!/^[0-9]{9}[0-9X]$/.test(isbn)) return false
  let sum = 0
  for (let i = 0; i < 10; i++) {
    const digit = isbn[i] === 'X' ? 10 : Number(isbn[i])
    sum += digit * (10 - i)
  }
  return sum % 11 === 0
}

function isbn13CheckDigit(first12: string): string {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3)
  return String((10 - (sum % 10)) % 10)
}

export function isValidIsbn13(raw: string): boolean {
  const isbn = normalizeIsbn(raw)
  if (!/^97[89][0-9]{10}$/.test(isbn)) return false
  return isbn13CheckDigit(isbn.slice(0, 12)) === isbn[12]
}

export function isValidIsbn(raw: string): boolean {
  return isValidIsbn10(raw) || isValidIsbn13(raw)
}

export function isbn10To13(raw: string): string {
  const core = '978' + normalizeIsbn(raw).slice(0, 9)
  return core + isbn13CheckDigit(core)
}

/** Only 978-prefixed ISBN-13s have an ISBN-10 equivalent. */
export function isbn13To10(raw: string): string | null {
  const isbn = normalizeIsbn(raw)
  if (!isbn.startsWith('978')) return null
  const core = isbn.slice(3, 12)
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i)
  const check = (11 - (sum % 11)) % 11
  return core + (check === 10 ? 'X' : String(check))
}

/** Turns any valid ISBN into both forms, or null if it isn't valid. */
export function splitIsbn(raw: string): { isbn13: string; isbn10: string | null } | null {
  if (isValidIsbn13(raw)) {
    const isbn13 = normalizeIsbn(raw)
    return { isbn13, isbn10: isbn13To10(isbn13) }
  }
  if (isValidIsbn10(raw)) {
    const isbn10 = normalizeIsbn(raw)
    return { isbn13: isbn10To13(isbn10), isbn10 }
  }
  return null
}
