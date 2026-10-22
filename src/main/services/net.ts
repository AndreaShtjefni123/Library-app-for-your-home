// The only place the app talks to the internet. Requests go to a short list of book catalogues;
// anything else is refused.

export const ALLOWED_HOSTS = new Set([
  'openlibrary.org',
  'covers.openlibrary.org',
  'www.googleapis.com',
  'books.google.com',
  'books.googleusercontent.com'
])

const USER_AGENT = "HomeLibrary/0.2 (personal home library desktop app)"
const TIMEOUT_MS = 8000
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export type NetErrorKind = 'offline' | 'timeout' | 'quota' | 'not_found' | 'http' | 'blocked'

export class NetError extends Error {
  constructor(
    public kind: NetErrorKind,
    message: string,
    public status?: number
  ) {
    super(message)
  }
}

export function assertAllowed(url: string): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new NetError('blocked', `Not a web address: ${url}`)
  }
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new NetError('blocked', `Not an allowed book catalogue: ${parsed.hostname}`)
  }
  return parsed
}

const OFFLINE_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH'])

// ---------- Fake internet for automated tests ----------
// When HOME_LIBRARY_FAKE_NET points at a folder with fake-net.json, answers come from files there
// instead of the internet; an "OFFLINE" file in that folder simulates having no connection.
// (The packaged app clears this variable at startup, see index.ts.)

interface FakeRoute {
  match: string
  file?: string
  /** Answer with this HTTP status instead of a file (e.g. 429 = too many requests). */
  status?: number
}

async function fakeResponse(url: string, dir: string): Promise<Response> {
  const { existsSync, readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  if (existsSync(join(dir, 'OFFLINE'))) throw new NetError('offline', 'No internet connection (simulated)')
  const routes = JSON.parse(readFileSync(join(dir, 'fake-net.json'), 'utf8')) as FakeRoute[]
  const route = routes.find((r) => url.includes(r.match))
  if (!route) return new Response('not found', { status: 404 })
  if (route.status || !route.file) return new Response('', { status: route.status ?? 404 })
  const body = readFileSync(join(dir, route.file))
  const type = route.file.endsWith('.json') ? 'application/json' : 'image/jpeg'
  return new Response(body, { status: 200, headers: { 'content-type': type } })
}

async function request(url: string, accept: string): Promise<Response> {
  assertAllowed(url)
  const fakeDir = process.env['HOME_LIBRARY_FAKE_NET']
  if (fakeDir) return checkStatus(await fakeResponse(url, fakeDir))
  let res: Response
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: accept },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow'
    })
  } catch (err) {
    const e = err as { name?: string; cause?: { code?: string } }
    if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new NetError('timeout', 'The catalogue took too long to answer')
    if (e.cause?.code && OFFLINE_CODES.has(e.cause.code)) throw new NetError('offline', 'No internet connection')
    throw new NetError('offline', 'Could not reach the catalogue')
  }
  return checkStatus(res)
}

function checkStatus(res: Response): Response {
  if (res.status === 429) throw new NetError('quota', 'Too many requests', 429)
  if (res.status === 404) throw new NetError('not_found', 'Not found', 404)
  if (!res.ok) throw new NetError('http', `The catalogue answered ${res.status}`, res.status)
  return res
}

const jsonInFlight = new Map<string, Promise<unknown>>()
const jsonRecent = new Map<string, { at: number; value: unknown }>()
const JSON_MEMORY_MS = 60_000

/**
 * Fetches JSON. Identical requests made at the same time share one download, and answers are
 * kept in memory for a minute (typing and backspacing doesn't ask the catalogue twice).
 */
export async function fetchJson<T>(url: string): Promise<T> {
  const recent = jsonRecent.get(url)
  if (recent && Date.now() - recent.at < JSON_MEMORY_MS) return recent.value as T
  const pending = jsonInFlight.get(url)
  if (pending) return pending as Promise<T>
  const p = request(url, 'application/json')
    .then((res) => res.json() as Promise<T>)
    .then((value) => {
      jsonRecent.set(url, { at: Date.now(), value })
      if (jsonRecent.size > 200) jsonRecent.delete(jsonRecent.keys().next().value!)
      return value
    })
    .finally(() => jsonInFlight.delete(url))
  jsonInFlight.set(url, p)
  return p
}

/** For tests: forget remembered answers (e.g. after simulating going offline). */
export function forgetRecentJson(): void {
  jsonRecent.clear()
}

const imageCache = new Map<string, { bytes: Buffer; contentType: string }>()
const IMAGE_CACHE_SIZE = 300

/** Downloads a cover or photo. Recently seen images are served from memory. */
export async function fetchImage(url: string): Promise<{ bytes: Buffer; contentType: string }> {
  const hit = imageCache.get(url)
  if (hit) return hit
  const image = await downloadImage(url)
  imageCache.set(url, image)
  if (imageCache.size > IMAGE_CACHE_SIZE) imageCache.delete(imageCache.keys().next().value!)
  return image
}

async function downloadImage(url: string): Promise<{ bytes: Buffer; contentType: string }> {
  const res = await request(url, 'image/*')
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
  if (!contentType.startsWith('image/')) throw new NetError('http', 'That address did not return an image')
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.length > MAX_IMAGE_BYTES) throw new NetError('http', 'Image too large')
  // Open Library sends a tiny 1×1 placeholder when it has no cover.
  if (bytes.length < 1000) throw new NetError('not_found', 'No cover image')
  return { bytes, contentType }
}
