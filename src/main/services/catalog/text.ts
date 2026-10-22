import type { BookFormat } from '../../../shared/books'

/** Turns catalogue text (HTML from Google, Markdown from Open Library) into plain paragraphs. */
export function plainText(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw : (raw as { value?: unknown } | null)?.value
  if (typeof value !== 'string') return null
  let s = value
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
  // Markdown: [text](link) → text, **bold** / *italic* → plain, drop "Source:" footers and rules.
  s = s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1$2')
    .replace(/^\s*-{3,}\s*$/gm, '')
    .replace(/^\s*\(?\s*source\s*:.*$/gim, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return s || null
}

const LANGUAGES: Record<string, string> = {
  eng: 'English', en: 'English',
  spa: 'Spanish', es: 'Spanish',
  fre: 'French', fra: 'French', fr: 'French',
  ger: 'German', deu: 'German', de: 'German',
  ita: 'Italian', it: 'Italian',
  por: 'Portuguese', pt: 'Portuguese',
  dut: 'Dutch', nld: 'Dutch', nl: 'Dutch',
  swe: 'Swedish', sv: 'Swedish',
  nor: 'Norwegian', no: 'Norwegian', nb: 'Norwegian',
  dan: 'Danish', da: 'Danish',
  fin: 'Finnish', fi: 'Finnish',
  pol: 'Polish', pl: 'Polish',
  rus: 'Russian', ru: 'Russian',
  ukr: 'Ukrainian', uk: 'Ukrainian',
  jpn: 'Japanese', ja: 'Japanese',
  chi: 'Chinese', zho: 'Chinese', zh: 'Chinese',
  kor: 'Korean', ko: 'Korean',
  ara: 'Arabic', ar: 'Arabic',
  alb: 'Albanian', sqi: 'Albanian', sq: 'Albanian',
  gre: 'Greek', ell: 'Greek', el: 'Greek',
  tur: 'Turkish', tr: 'Turkish',
  heb: 'Hebrew', he: 'Hebrew',
  hin: 'Hindi', hi: 'Hindi',
  cze: 'Czech', ces: 'Czech', cs: 'Czech',
  hun: 'Hungarian', hu: 'Hungarian',
  rum: 'Romanian', ron: 'Romanian', ro: 'Romanian',
  scc: 'Serbian', srp: 'Serbian', sr: 'Serbian',
  scr: 'Croatian', hrv: 'Croatian', hr: 'Croatian',
  lat: 'Latin', la: 'Latin',
  cat: 'Catalan', ca: 'Catalan'
}

/** "eng", "/languages/eng" or "en" → "English". Unknown codes are returned as given. */
export function languageName(code: string | null | undefined): string | null {
  if (!code) return null
  const key = code.replace('/languages/', '').toLowerCase()
  return LANGUAGES[key] ?? key
}

/** Maps the many ways catalogues describe a format onto the app's five. */
export function formatFrom(raw: string | null | undefined): BookFormat | null {
  if (!raw) return null
  const s = raw.toLowerCase()
  if (/hard\s*(cover|back)|hardbound|library binding/.test(s)) return 'hardcover'
  if (/paper\s*(back|bound)|softcover|soft cover|mass market|trade/.test(s)) return 'paperback'
  if (/e-?book|kindle|epub|electronic|digital/.test(s)) return 'ebook'
  if (/audio|cd|mp3/.test(s)) return 'audiobook'
  return 'other'
}

/** First 4-digit year in a date string like "March 2004", "2004-03-01" or "c1999". */
export function yearFrom(date: string | null | undefined): number | null {
  const m = date ? /(?<!\d)(1[0-9]{3}|20[0-9]{2})(?!\d)/.exec(date) : null
  return m ? Number(m[1]) : null
}

/** Normalises a catalogue date to the app's "YYYY", "YYYY-MM" or "YYYY-MM-DD"; null if no year. */
export function isoDateFrom(date: string | null | undefined): string | null {
  if (!date) return null
  const iso = /^(\d{4})(-\d{2})?(-\d{2})?$/.exec(date.trim())
  if (iso) return iso[0]
  const parsed = new Date(date)
  if (!Number.isNaN(parsed.getTime()) && /\d{1,2}/.test(date.replace(/\d{4}/, '')) && /[a-z]/i.test(date)) {
    const y = parsed.getFullYear()
    const m = String(parsed.getMonth() + 1).padStart(2, '0')
    const d = String(parsed.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const year = yearFrom(date)
  return year ? String(year) : null
}

/** "Discworld ; 1", "Discworld #1", "Discworld, no. 1" → { name, number }. */
export function seriesFrom(raw: string | null | undefined): { name: string; number: number | null } | null {
  if (!raw) return null
  const m = /^(.*?)(?:\s*[;,#(]\s*(?:no\.?|book|vol\.?|volume)?\s*(\d+(?:\.\d+)?)\)?)?\s*$/i.exec(raw.trim())
  const name = m?.[1]?.trim()
  if (!name) return null
  return { name, number: m?.[2] ? Number(m[2]) : null }
}

export function cleanTitle(s: string | null | undefined): string | null {
  const t = s?.replace(/\s+/g, ' ').trim()
  return t ? t : null
}
