import type pg from 'pg'
import type { BookInput, DuplicateCandidate } from '../../../shared/books'
import { splitIsbn } from '../../../shared/isbn'

/** How alike two titles must be (0–1, trigram similarity) to count as a possible duplicate. */
export const TITLE_SIMILARITY = 0.6

/**
 * Books that look like the one being added: the same ISBN, or a very similar title
 * by a matching author ("The Hobbit" vs "Hobbit, The").
 */
export async function findDuplicates(
  db: pg.Pool,
  input: Pick<BookInput, 'title' | 'isbn' | 'contributors'>,
  excludeId?: string
): Promise<DuplicateCandidate[]> {
  const isbn13 = input.isbn ? (splitIsbn(input.isbn)?.isbn13 ?? null) : null
  const authors = input.contributors.filter((c) => c.role === 'author').map((c) => c.name.toLowerCase())
  const title = input.title.trim().toLowerCase().replace(/^(the|a|an)\s+/, '')

  const r = await db.query<{ id: string; title: string; authors: string[]; pub_year: number | null; reason: 'isbn' | 'title' }>(
    `SELECT e.id, e.title, e.pub_year,
       coalesce((SELECT array_agg(p.display_name ORDER BY ec.position) FROM edition_contributor ec
                 JOIN person p ON p.id = ec.person_id WHERE ec.edition_id = e.id AND ec.role = 'author'), '{}') AS authors,
       CASE WHEN $1::text IS NOT NULL AND e.isbn13 = $1 THEN 'isbn' ELSE 'title' END AS reason
     FROM edition e
     WHERE e.deleted_at IS NULL
       AND ($4::uuid IS NULL OR e.id <> $4)
       AND (
         ($1::text IS NOT NULL AND e.isbn13 = $1)
         OR (
           similarity(e.sort_title, $2) >= $5
           AND (
             cardinality($3::text[]) = 0
             OR NOT EXISTS (SELECT 1 FROM edition_contributor ec WHERE ec.edition_id = e.id AND ec.role = 'author')
             OR EXISTS (
               SELECT 1 FROM edition_contributor ec JOIN person p ON p.id = ec.person_id
               WHERE ec.edition_id = e.id AND ec.role = 'author'
                 AND EXISTS (SELECT 1 FROM unnest($3::text[]) a WHERE similarity(lower(p.display_name), a) >= 0.5)
             )
           )
         )
       )
     ORDER BY (e.isbn13 = $1) DESC NULLS LAST, similarity(e.sort_title, $2) DESC
     LIMIT 5`,
    [isbn13, title, authors, excludeId ?? null, TITLE_SIMILARITY]
  )
  return r.rows.map((row) => ({
    id: row.id,
    title: row.title,
    authors: row.authors,
    pubYear: row.pub_year,
    reason: row.reason
  }))
}
