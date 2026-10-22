import { useEffect, useState } from 'react'
import { PlaceholderCover } from './PlaceholderCover'

type Size = 'sm' | 'md' | 'lg'

const FRAME =
  'aspect-[2/3] w-full overflow-hidden rounded-[4px] bg-border/40 shadow-[0_1px_2px_rgb(0_0_0/0.2),0_6px_16px_-8px_rgb(0_0_0/0.45)]'

interface CoverImageProps {
  src: string
  /** A smaller version shown at once while `src` loads (e.g. the one already seen in a list). */
  lowSrc?: string
  title: string
  author?: string
  size: Size
  className: string
}

function CoverImage({ src, lowSrc, title, author, size, className }: CoverImageProps) {
  const [hiReady, setHiReady] = useState(!lowSrc)
  const [hiFailed, setHiFailed] = useState(false)
  const [lowFailed, setLowFailed] = useState(false)

  useEffect(() => {
    if (!lowSrc) return
    const img = new Image()
    img.onload = () => setHiReady(true)
    img.onerror = () => setHiFailed(true)
    img.src = src
    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [src, lowSrc])

  const showing = hiReady ? src : lowSrc!
  if ((hiReady && hiFailed) || (!hiReady && lowFailed && hiFailed) || (!lowSrc && hiFailed)) {
    return <PlaceholderCover title={title} author={author} size={size} className={className} />
  }
  return (
    <div className={`${FRAME} ${className}`}>
      <img
        src={showing}
        alt=""
        decoding="async"
        draggable={false}
        onError={() => (showing === src ? setHiFailed(true) : setLowFailed(true))}
        className={`size-full object-cover transition-[filter] duration-300 ${hiReady ? '' : 'blur-[0.5px]'}`}
      />
    </div>
  )
}

/** A book in your library: its saved cover, or a made-up one if it has none. */
export function BookCover({
  book,
  size = 'md',
  className = ''
}: {
  book: { id: string; title: string; authors?: string[]; coverPath: string | null; coverVersion?: string }
  size?: Size
  className?: string
}) {
  const author = book.authors?.join(', ')
  if (!book.coverPath) return <PlaceholderCover title={book.title} author={author} size={size} className={className} />
  // Grids use the small preview; the book page uses the full picture.
  const src = `cover://books/${book.id}?${size === 'lg' ? '' : 'size=thumb&'}v=${book.coverVersion ?? ''}`
  return <CoverImage key={src} src={src} title={book.title} author={author} size={size} className={className} />
}

/** Address of a catalogue image fetched safely by the app (not by this window). */
export const remoteSrc = (url: string): string => `remote-img://img/?u=${encodeURIComponent(url)}`

/** A cover from Open Library / Google Books. With `lowUrl`, a quick small version shows first. */
export function RemoteCover({
  url,
  lowUrl,
  title,
  author,
  size = 'md',
  className = ''
}: {
  url: string | null
  lowUrl?: string | null
  title: string
  author?: string
  size?: Size
  className?: string
}) {
  if (!url) return <PlaceholderCover title={title} author={author} size={size} className={className} />
  return (
    <CoverImage
      key={url}
      src={remoteSrc(url)}
      lowSrc={lowUrl && lowUrl !== url ? remoteSrc(lowUrl) : undefined}
      title={title}
      author={author}
      size={size}
      className={className}
    />
  )
}
