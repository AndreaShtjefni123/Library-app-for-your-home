import type pg from 'pg'
import type { Ownership, SetReadingInput, Shelf, ShelfCounts, ShelfPreview } from '../../../shared/books'
import { inTransaction } from './editions'

export async function shelfCounts(db: pg.Pool): Promise<ShelfCounts> {
  const r = await db.query<Record<string, string>>(
    `SELECT count(*) AS all,
       count(*) FILTER (WHERE e.record_status = 'owned')      AS own,
       count(*) FILTER (WHERE e.record_status = 'wishlist')   AS "want-to-buy",
       count(*) FILTER (WHERE rs.status = 'read')             AS read,
       count(*) FILTER (WHERE rs.status = 'reading')          AS reading,
       count(*) FILTER (WHERE rs.status = 'partly_read')      AS "partly-read",
       count(*) FILTER (WHERE rs.status = 'want')             AS "to-read",
       count(*) FILTER (WHERE rs.status = 'dnf')              AS dnf
     FROM edition e LEFT JOIN reading_status rs ON rs.edition_id = e.id
     WHERE e.deleted_at IS NULL`
  )
  const row = r.rows[0]
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)])) as ShelfCounts
}

/** Own / Want to buy / neither. Owning a book makes sure it has at least one physical copy. */
export async function setOwnership(pool: pg.Pool, id: string, ownership: Ownership): Promise<void> {
  await inTransaction(pool, async (db) => {
    const r = await db.query('UPDATE edition SET record_status = $2 WHERE id = $1 AND deleted_at IS NULL', [id, ownership])
    if (r.rowCount === 0) throw new Error('That book no longer exists')
    if (ownership === 'owned') {
      await db.query(
        `INSERT INTO copy (edition_id, format)
         SELECT id, format FROM edition e WHERE e.id = $1
           AND NOT EXISTS (SELECT 1 FROM copy c WHERE c.edition_id = e.id AND c.deleted_at IS NULL)`,
        [id]
      )
    }
  })
}

/**
 * Moves a book between To-read, Currently reading, Partly read, Read and Did not finish
 * (or clears it). Dates fill themselves in: starting sets "started", finishing sets "finished".
 */
export async function setReadingStatus(pool: pg.Pool, input: SetReadingInput): Promise<void> {
  const { id, status } = input
  if (status === null) {
    await pool.query('DELETE FROM reading_status WHERE edition_id = $1', [id])
    return
  }
  const partly = status === 'partly_read'
  const hasProgress = input.currentPage != null || input.progressPercent != null
  await pool.query(
    `INSERT INTO reading_status AS rs (edition_id, status, started_at, finished_at, current_page, progress_percent,
                                       last_read_at, paused_at, paused_note)
     VALUES ($1, $2,
             CASE WHEN $2 IN ('reading', 'partly_read', 'read', 'dnf') THEN current_date END,
             CASE WHEN $2 = 'read' THEN current_date END,
             $3, $4,
             CASE WHEN $6 THEN now() END,
             CASE WHEN $7 THEN now() END,
             CASE WHEN $7 THEN $5 END)
     ON CONFLICT (edition_id) DO UPDATE SET
       status           = EXCLUDED.status,
       started_at       = coalesce(rs.started_at, EXCLUDED.started_at),
       finished_at      = CASE WHEN EXCLUDED.status = 'read' THEN coalesce(rs.finished_at, current_date) ELSE NULL END,
       current_page     = CASE WHEN $6 THEN $3 WHEN EXCLUDED.status = 'read' THEN NULL ELSE rs.current_page END,
       progress_percent = CASE WHEN $6 THEN $4 WHEN EXCLUDED.status = 'read' THEN NULL ELSE rs.progress_percent END,
       last_read_at     = CASE WHEN $6 THEN now() ELSE rs.last_read_at END,
       paused_at        = CASE WHEN $7 THEN coalesce(rs.paused_at, now()) ELSE NULL END,
       paused_note      = CASE WHEN $7 THEN coalesce($5, rs.paused_note) ELSE NULL END`,
    [id, status, input.currentPage ?? null, input.progressPercent ?? null, input.note ?? null, hasProgress, partly]
  )
  if (hasProgress) {
    await pool.query('INSERT INTO progress_entry (edition_id, page, percent) VALUES ($1, $2, $3)', [
      id,
      input.currentPage ?? null,
      input.progressPercent ?? null
    ])
  }
}

const PREVIEW_SHELVES: { shelf: Shelf; where: string }[] = [
  { shelf: 'to-read', where: "rs.status = 'want'" },
  { shelf: 'want-to-buy', where: "e.record_status = 'wishlist'" },
  { shelf: 'reading', where: "rs.status = 'reading'" },
  { shelf: 'read', where: "rs.status = 'read'" }
]

/** For the Pinterest-style "Save to…" panel: each shelf's size and its three newest covers. */
export async function shelfPreviews(db: pg.Pool): Promise<ShelfPreview[]> {
  return Promise.all(
    PREVIEW_SHELVES.map(async ({ shelf, where }) => {
      const r = await db.query<{ id: string; title: string; cover_path: string | null; total: string }>(
        `SELECT e.id, e.title, e.cover_path, count(*) OVER () AS total
         FROM edition e LEFT JOIN reading_status rs ON rs.edition_id = e.id
         WHERE e.deleted_at IS NULL AND ${where}
         ORDER BY (e.cover_path IS NOT NULL) DESC, e.created_at DESC
         LIMIT 3`
      )
      return {
        shelf,
        count: r.rows.length ? Number(r.rows[0].total) : 0,
        recent: r.rows.map((x) => ({ id: x.id, title: x.title, coverPath: x.cover_path }))
      }
    })
  )
}
