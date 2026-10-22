import { protocol } from 'electron'
import { readCover, type CoverKind } from './services/covers'
import { assertAllowed, fetchImage } from './services/net'

// Two private address types for pictures, so the app window itself never needs internet access:
//   cover://books/<id> or cover://authors/<id>  – images saved on this PC
//   remote-img://img/?u=<address>               – a catalogue's cover, fetched here in the main process

export function registerImageSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'cover', privileges: { standard: true, secure: true, supportFetchAPI: true } },
    { scheme: 'remote-img', privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

const notFound = (): Response => new Response(null, { status: 404 })

export function handleImageSchemes(coversDir: () => string): void {
  protocol.handle('cover', async (request) => {
    const url = new URL(request.url)
    const kind = url.hostname as CoverKind
    const id = url.pathname.replace(/^\//, '')
    if (kind !== 'books' && kind !== 'authors') return notFound()
    const size = url.searchParams.get('size') === 'thumb' ? 'thumb' : 'full'
    const image = await readCover(coversDir(), kind, id, size).catch(() => null)
    if (!image) return notFound()
    return new Response(new Uint8Array(image.bytes), { headers: { 'content-type': image.type, 'cache-control': 'max-age=3600' } })
  })

  protocol.handle('remote-img', async (request) => {
    const target = new URL(request.url).searchParams.get('u')
    if (!target) return notFound()
    try {
      assertAllowed(target)
      const image = await fetchImage(target)
      return new Response(new Uint8Array(image.bytes), {
        headers: { 'content-type': image.contentType, 'cache-control': 'max-age=86400' }
      })
    } catch {
      return notFound()
    }
  })
}
