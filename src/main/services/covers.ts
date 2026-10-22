import { mkdir, readFile, rename, rm, writeFile, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type pg from 'pg'
import type { ImageTools } from './imageTools'

// Covers live as plain files in %APPDATA%\HomeLibrary\covers:
//   books\<book id>         the cover as downloaded or chosen
//   books\<book id>.thumb   a small preview for grids and lists
//   books\<book id>.prev    the previous cover, kept so "Undo" works after changing it
//   authors\<person id>     author photos
// The database only stores the relative path, which keeps it small and fast.

export type CoverKind = 'books' | 'authors'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function coverPath(baseDir: string, kind: CoverKind, id: string): string {
  if (!UUID.test(id)) throw new Error('Bad cover id')
  return join(baseDir, kind, id)
}

export async function saveCover(baseDir: string, kind: CoverKind, id: string, bytes: Buffer): Promise<string> {
  const file = coverPath(baseDir, kind, id)
  await mkdir(join(baseDir, kind), { recursive: true })
  await writeFile(file + '.tmp', bytes)
  await rename(file + '.tmp', file)
  return `${kind}/${id}`
}

/** Recognises the image type from its first bytes (files are stored without an extension). */
export function sniffImageType(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png'
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  if (bytes.subarray(0, 3).toString('ascii') === 'GIF') return 'image/gif'
  return 'application/octet-stream'
}

export async function readCover(
  baseDir: string,
  kind: CoverKind,
  id: string,
  size: 'full' | 'thumb' = 'full'
): Promise<{ bytes: Buffer; type: string } | null> {
  const file = coverPath(baseDir, kind, id)
  for (const candidate of size === 'thumb' ? [file + '.thumb', file] : [file]) {
    try {
      const bytes = await readFile(candidate)
      return { bytes, type: sniffImageType(bytes) }
    } catch {
      /* try the next one */
    }
  }
  return null
}

/**
 * Saves a book's cover with its small preview and main colour, and records them on the book.
 * The cover it replaces is kept as ".prev" so the change can be undone.
 */
export async function storeBookCover(
  db: pg.Pool,
  baseDir: string,
  id: string,
  bytes: Buffer,
  tools: ImageTools
): Promise<{ path: string; colour: string }> {
  const thumb = tools.thumbnail(bytes)
  const colour = tools.mainColour(bytes)
  const file = coverPath(baseDir, 'books', id)
  if (existsSync(file)) await copyFile(file, file + '.prev')
  const path = await saveCover(baseDir, 'books', id, bytes)
  await writeFile(file + '.thumb', thumb)
  await db.query('UPDATE edition SET cover_path = $2, spine_colour = $3 WHERE id = $1', [id, path, colour])
  return { path, colour }
}

/** Takes the cover off a book (kept as ".prev" for Undo); the made-up cover shows instead. */
export async function removeBookCover(db: pg.Pool, baseDir: string, id: string): Promise<void> {
  const file = coverPath(baseDir, 'books', id)
  if (existsSync(file)) await rename(file, file + '.prev')
  await rm(file + '.thumb', { force: true })
  await db.query('UPDATE edition SET cover_path = NULL, spine_colour = NULL WHERE id = $1', [id])
}

/** Undo: puts the previous cover back (or removes the cover if there wasn't one). */
export async function restorePreviousCover(db: pg.Pool, baseDir: string, id: string, tools: ImageTools): Promise<void> {
  const file = coverPath(baseDir, 'books', id)
  if (!existsSync(file + '.prev')) {
    await removeBookCover(db, baseDir, id)
    await rm(file + '.prev', { force: true })
    return
  }
  const bytes = await readFile(file + '.prev')
  await rm(file + '.prev', { force: true })
  await saveCover(baseDir, 'books', id, bytes)
  await writeFile(file + '.thumb', tools.thumbnail(bytes))
  await db.query('UPDATE edition SET cover_path = $2, spine_colour = $3 WHERE id = $1', [id, `books/${id}`, tools.mainColour(bytes)])
}

/** One-off tidy-up for covers saved before previews and colours existed. */
export async function backfillCoverExtras(db: pg.Pool, baseDir: string, tools: ImageTools): Promise<number> {
  const r = await db.query<{ id: string }>(
    'SELECT id FROM edition WHERE cover_path IS NOT NULL AND spine_colour IS NULL AND deleted_at IS NULL LIMIT 500'
  )
  let done = 0
  for (const { id } of r.rows) {
    try {
      const bytes = await readFile(coverPath(baseDir, 'books', id))
      await writeFile(coverPath(baseDir, 'books', id) + '.thumb', tools.thumbnail(bytes))
      await db.query('UPDATE edition SET spine_colour = $2 WHERE id = $1', [id, tools.mainColour(bytes)])
      done++
    } catch {
      /* skip unreadable files */
    }
  }
  return done
}
