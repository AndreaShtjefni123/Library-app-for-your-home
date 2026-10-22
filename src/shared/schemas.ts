import { z } from 'zod'
import { CONDITIONS, FORMATS, OWNERSHIP, READING_STATUSES, ROLES, SHELVES, SORT_KEYS } from './books'
import { isValidIsbn } from './isbn'
import { ADD_TARGETS } from './catalog'

export const SetupInputSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  database: z.string().min(1).max(63),
  superuser: z.string().min(1),
  superuserPassword: z.string().min(1, 'Enter your PostgreSQL password')
})

export const ThemeInputSchema = z.enum(['light', 'dark'])

// ---------- Books ----------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined))

export const BookInputSchema = z.object({
  title: z.string().trim().min(1, 'A title is needed').max(500),
  subtitle: optionalText(500),
  // Blank rows left in the form are simply dropped.
  contributors: z
    .array(z.object({ name: z.string().trim().max(200), role: z.enum(ROLES) }))
    .max(30)
    .default([])
    .transform((list) => list.filter((c) => c.name !== '')),
  publisher: optionalText(200),
  pubDate: z
    .string()
    .trim()
    .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, 'Use a year like 2020, or a date like 2020-09-15')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  pages: z.number().int().min(1).max(100_000).optional(),
  isbn: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidIsbn(v), 'That ISBN doesn’t check out — look for a typo')
    .optional()
    .transform((v) => (v ? v : undefined)),
  format: z.enum(FORMATS).optional(),
  language: optionalText(50),
  description: optionalText(20_000),
  seriesName: optionalText(200),
  seriesNumber: z.number().min(0).max(9999).optional(),
  ownership: z.enum(OWNERSHIP),
  readingStatus: z.enum(READING_STATUSES).nullable().optional()
})

export const ListParamsSchema = z.object({
  shelf: z.enum(SHELVES).optional(),
  sort: z.enum(SORT_KEYS),
  dir: z.enum(['asc', 'desc']),
  offset: z.number().int().min(0),
  limit: z.number().int().min(1).max(500)
})

export const IdSchema = z.uuid()

export const SetReadingSchema = z.object({
  id: z.uuid(),
  status: z.enum(READING_STATUSES).nullable(),
  currentPage: z.number().int().min(0).nullable().optional(),
  progressPercent: z.number().min(0).max(100).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional()
})

export const SetOwnershipSchema = z.object({ id: z.uuid(), ownership: z.enum(OWNERSHIP) })

// ---------- Online catalogue ----------

const olKey = z.string().regex(/^OL\d+[WMA]$/)
export const CatalogRefSchema = z.object({
  olWorkKey: olKey.optional(),
  olEditionKey: olKey.optional(),
  googleId: z.string().regex(/^[\w-]{1,40}$/).optional(),
  isbn: z.string().max(20).optional(),
  olAuthorKeys: z.array(olKey).max(6).optional()
})

export const SearchQuerySchema = z.string().trim().min(1).max(200)
export const SuggestModeSchema = z.enum(['quick', 'full'])
export const WorkKeySchema = olKey

const httpsUrl = z.url({ protocol: /^https$/ }).max(1000)
const text = (max: number) => z.string().max(max)

export const CatalogBookSchema = z.object({
  ref: CatalogRefSchema,
  title: text(500).min(1),
  subtitle: text(500).nullable(),
  contributors: z
    .array(
      z.object({
        name: text(200).min(1),
        role: z.enum(ROLES),
        bio: text(20_000).nullable(),
        birthDate: text(100).nullable(),
        deathDate: text(100).nullable(),
        photoUrl: httpsUrl.nullable()
      })
    )
    .max(30),
  description: text(50_000).nullable(),
  subjects: z.array(text(200)).max(50),
  genres: z.array(text(200)).max(20),
  series: z.object({ name: text(200), number: z.number().nullable() }).nullable(),
  publisher: text(300).nullable(),
  pubDate: text(20).nullable(),
  firstPublishedYear: z.number().int().nullable(),
  pages: z.number().int().nullable(),
  language: text(100).nullable(),
  isbn13: text(13).nullable(),
  isbn10: text(10).nullable(),
  format: z.enum(FORMATS).nullable(),
  coverUrl: httpsUrl.nullable(),
  ratingAvg: z.number().nullable(),
  ratingCount: z.number().int().nullable(),
  editionCount: z.number().int().nullable(),
  links: z.array(z.object({ label: text(100), url: httpsUrl })).max(10),
  sources: z.array(z.enum(['openlibrary', 'google'])).max(2),
  inLibraryId: z.string().nullable()
})

export const AddTargetSchema = z.enum(ADD_TARGETS)
export const GoogleKeySchema = z.string().trim().max(100).regex(/^[\w-]*$/, 'That doesn\u2019t look like a Google API key')

// ---------- Make it yours ----------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2024-05-31')
const shortText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null))

export const CopyPatchSchema = z
  .object({
    format: z.enum(FORMATS).nullable(),
    condition: z.enum(CONDITIONS).nullable(),
    locationNote: shortText(200),
    acquiredDate: isoDate.nullable(),
    acquiredSource: shortText(200),
    price: z
      .string()
      .trim()
      .regex(/^\d{1,8}(\.\d{1,2})?$/, 'Use a price like 12.99')
      .nullable(),
    currency: shortText(10),
    giftFrom: shortText(200),
    isSigned: z.boolean(),
    signedBy: shortText(200),
    isFirstEdition: z.boolean(),
    limitedNumber: shortText(50),
    notes: shortText(5000)
  })
  .partial()

export const RatingSchema = z
  .number()
  .min(0.5)
  .max(5)
  .refine((n) => Number.isInteger(n * 2), 'Ratings go in half stars')
  .nullable()
export const WritingSchema = z.object({ field: z.enum(['review', 'notes']), text: z.string().max(100_000).nullable() })
export const DatesSchema = z.object({ startedAt: isoDate.nullable(), finishedAt: isoDate.nullable() })
export const TagsSchema = z.array(z.string().trim().min(1).max(60)).max(30)
export const QuoteSchema = z.object({
  id: z.uuid().optional(),
  text: z.string().trim().min(1, 'Type the quote').max(5000),
  page: z.number().int().min(0).max(100_000).nullable(),
  comment: shortText(2000)
})
export const ProgressSchema = z
  .object({ page: z.number().int().min(0).max(100_000).nullable(), percent: z.number().min(0).max(100).nullable() })
  .refine((p) => p.page !== null || p.percent !== null, 'Enter a page or a percent')
export const SnoozeSchema = z.number().int().min(1).max(3650).nullable()
export const SuggestDaysSchema = z.number().int().min(1).max(365)
export const CoverBytesSchema = z.instanceof(Uint8Array).refine((b) => b.byteLength > 0 && b.byteLength <= 15 * 1024 * 1024, 'Pictures up to 15 MB')
