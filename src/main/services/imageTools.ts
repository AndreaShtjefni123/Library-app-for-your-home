import { nativeImage } from 'electron'

/** Picture work done with Electron's built-in image tools (no extra libraries). */
export interface ImageTools {
  /** A small JPEG preview for grids and lists. */
  thumbnail: (bytes: Buffer) => Buffer
  /** The cover's main colour as "#rrggbb" (used for spines on the shelf). */
  mainColour: (bytes: Buffer) => string
}

const THUMB_WIDTH = 320

function load(bytes: Buffer): Electron.NativeImage {
  const img = nativeImage.createFromBuffer(bytes)
  if (img.isEmpty()) throw new Error('That file is not a picture the app can read (use JPEG or PNG)')
  return img
}

export const electronImageTools: ImageTools = {
  thumbnail(bytes) {
    const img = load(bytes)
    const { width } = img.getSize()
    return (width > THUMB_WIDTH ? img.resize({ width: THUMB_WIDTH, quality: 'good' }) : img).toJPEG(82)
  },
  mainColour(bytes) {
    // Shrink to a few pixels and average them, giving colourful pixels more say than greys.
    const tiny = load(bytes).resize({ width: 8, height: 12, quality: 'good' })
    const px = tiny.toBitmap() // BGRA
    let r = 0
    let g = 0
    let b = 0
    let total = 0
    for (let i = 0; i < px.length; i += 4) {
      const [pb, pg, pr] = [px[i], px[i + 1], px[i + 2]]
      const max = Math.max(pr, pg, pb)
      const min = Math.min(pr, pg, pb)
      const weight = 0.25 + (max === 0 ? 0 : (max - min) / max)
      r += pr * weight
      g += pg * weight
      b += pb * weight
      total += weight
    }
    const hex = (v: number): string => Math.round(v / total).toString(16).padStart(2, '0')
    return `#${hex(r)}${hex(g)}${hex(b)}`
  }
}
