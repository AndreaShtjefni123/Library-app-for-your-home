import { useUi, type CoverLayout } from '../../stores/ui'

interface PlaceholderCoverProps {
  title: string
  author?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  /** Show this design instead of the one chosen in Settings (for previews). */
  layout?: CoverLayout
}

const CLOTHS = 8

function hash(text: string): number {
  let h = 0
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

/** Same book → same colour, every time. */
export function clothIndex(title: string): number {
  return (hash(title) % CLOTHS) + 1
}

export function clothColour(title: string): string {
  return `var(--cloth-${clothIndex(title)})`
}

export const LAYOUTS: { value: Exclude<CoverLayout, 'auto'>; label: string }[] = [
  { value: 'band', label: 'Classic band' },
  { value: 'plate', label: 'Framed plate' },
  { value: 'geo', label: 'Modern shapes' }
]

/** The layout for a book: your choice in Settings, or (on "Auto") one picked from the title. */
function layoutFor(title: string, choice: CoverLayout): Exclude<CoverLayout, 'auto'> {
  if (choice !== 'auto') return choice
  return LAYOUTS[hash(title + '~') % LAYOUTS.length].value
}

const TEXT = {
  sm: { title: 'text-[7px]', author: 'text-[5px]', pad: 'p-1', gap: 'gap-0.5' },
  md: { title: 'text-[15px]', author: 'text-[10px]', pad: 'p-3', gap: 'gap-1.5' },
  lg: { title: 'text-[26px]', author: 'text-[14px]', pad: 'p-6', gap: 'gap-3' }
}

const FRAME =
  'relative flex aspect-[2/3] overflow-hidden rounded-[4px] shadow-[0_1px_2px_rgb(0_0_0/0.2),0_6px_16px_-8px_rgb(0_0_0/0.45)]'

/** A made-up cover for books without a picture, in one of three designs. */
export function PlaceholderCover({ title, author, size = 'md', className = '', layout: forced }: PlaceholderCoverProps) {
  const choice = useUi((s) => s.coverLayout)
  const layout = layoutFor(title, forced ?? choice)
  const t = TEXT[size]
  const cloth = clothColour(title)
  const showAuthor = !!author && size !== 'sm'

  if (layout === 'band') {
    // Penguin-style: coloured bands top and bottom, title on a cream panel.
    return (
      <div className={`${FRAME} flex-col ${className}`} style={{ background: cloth }} aria-hidden="true" data-cover-layout="band">
        <div className="h-[18%]" />
        <div className={`flex flex-1 flex-col items-center justify-center bg-[#f4eee2] text-center text-[#2b2420] ${t.pad} ${t.gap}`}>
          <span className={`line-clamp-4 font-display font-semibold leading-tight ${t.title}`}>{title}</span>
          {showAuthor && <span className={`line-clamp-2 uppercase tracking-[0.14em] opacity-70 ${t.author}`}>{author}</span>}
        </div>
        <div className="h-[18%]" />
        <Spine />
      </div>
    )
  }

  if (layout === 'plate') {
    // A cloth hardback with a gilt-ruled plate in the middle.
    return (
      <div className={`${FRAME} items-center justify-center ${className}`} style={{ background: cloth }} aria-hidden="true" data-cover-layout="plate">
        <div
          className={`m-[12%] flex flex-col items-center justify-center rounded-[2px] border border-[#d8b979]/70 text-center text-[#f6efe0] outline outline-1 outline-offset-[3px] outline-[#d8b979]/40 ${t.pad} ${t.gap}`}
        >
          <span className={`line-clamp-4 font-display font-semibold leading-tight ${t.title}`}>{title}</span>
          {size !== 'sm' && <span className={`text-[#d8b979] ${t.author}`}>&#x2766;</span>}
          {showAuthor && <span className={`line-clamp-2 uppercase tracking-[0.14em] opacity-80 ${t.author}`}>{author}</span>}
        </div>
        <Spine />
      </div>
    )
  }

  // Modern: overlapping shapes in lighter and darker tones of the cloth colour.
  const h = hash(title)
  return (
    <div className={`${FRAME} flex-col justify-end text-[#fbf8f2] ${className}`} style={{ background: cloth }} aria-hidden="true" data-cover-layout="geo">
      <span
        className="absolute aspect-square w-[78%] rounded-full bg-white/15"
        style={{ top: `${6 + (h % 14)}%`, left: `${-14 + (h % 30)}%` }}
      />
      <span className="absolute aspect-square w-[44%] rounded-full bg-black/20" style={{ top: `${24 + (h % 10)}%`, right: `${-8 + (h % 12)}%` }} />
      <span className="absolute h-[7%] w-[60%] bg-white/25" style={{ top: `${46 + (h % 8)}%`, left: '12%' }} />
      <div className={`relative flex flex-col ${t.pad} ${t.gap}`}>
        <span className={`line-clamp-4 font-display font-semibold leading-tight ${t.title}`}>{title}</span>
        {showAuthor && <span className={`line-clamp-2 uppercase tracking-[0.14em] opacity-85 ${t.author}`}>{author}</span>}
      </div>
      <Spine />
    </div>
  )
}

/** A soft fold near the spine makes it read as a book. */
function Spine() {
  return (
    <>
      <span className="pointer-events-none absolute inset-y-0 left-0 w-[6%] bg-black/15" />
      <span className="pointer-events-none absolute inset-y-0 left-[6%] w-px bg-white/15" />
    </>
  )
}
