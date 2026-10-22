import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { BurnCanvas, type BurnTexture } from './BurnCanvas'

export const BURN_MS = 2400
const REDUCED_MS = 350

// Fixed (not random) positions so the fire looks the same every time and nothing jumps.
const FLAMES = [
  { left: -2, width: 24, height: 62, delay: 0 },
  { left: 12, width: 26, height: 96, delay: 0.08 },
  { left: 28, width: 22, height: 74, delay: 0.17 },
  { left: 40, width: 26, height: 108, delay: 0.04 },
  { left: 56, width: 22, height: 80, delay: 0.13 },
  { left: 68, width: 26, height: 100, delay: 0.21 },
  { left: 82, width: 22, height: 66, delay: 0.09 },
  { left: 22, width: 16, height: 48, delay: 0.25 },
  { left: 62, width: 16, height: 52, delay: 0.3 }
]

/** A pointed flame tongue, drawn in a 100 × 160 box with its base at the bottom. */
const FLAME_PATH = 'M50 0 C57 30 92 56 88 102 C85 138 67 160 50 160 C33 160 15 138 12 102 C8 56 43 30 50 0 Z'
const CORE_PATH = 'M50 52 C55 74 76 92 73 118 C71 140 61 158 50 158 C39 158 29 140 27 118 C24 92 45 74 50 52 Z'
const EMBERS = Array.from({ length: 16 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i * 0.13) % 1.1,
  drift: ((i % 5) - 2) * 14
}))
const SMOKE = [
  { left: 5, delay: 0.3 },
  { left: 35, delay: 0.7 },
  { left: 60, delay: 0.5 }
]

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function webglAvailable(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!gl
  } catch {
    return false
  }
}

interface BurnAwayProps {
  burning: boolean
  onBurnt: () => void
  /** The cover picture, for the realistic graphics-card fire. Without it, the CSS fire is used. */
  loadTexture?: () => Promise<BurnTexture>
  children: ReactNode
}

/**
 * Wraps a book cover. When `burning` turns on, the cover catches fire from the bottom and burns
 * away; `onBurnt` is called once nothing is left. The realistic fire is drawn on the graphics
 * card (WebGL); if that isn't possible the simpler CSS flames are used, and with animations
 * turned off in Windows the cover just fades.
 */
export function BurnAway({ burning, onBurnt, loadTexture, children }: BurnAwayProps) {
  const id = useId().replace(/:/g, '')
  const targetRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'webgl' | 'css' | null>(null)
  // Keep the latest callback without restarting the fire when the page re-renders.
  const done = useRef(onBurnt)
  done.current = onBurnt

  useEffect(() => {
    if (!burning) {
      setMode(null)
      return
    }
    setMode(loadTexture && !reducedMotion() && webglAvailable() ? 'webgl' : 'css')
    // Choosing the fire happens once per burn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burning])

  useEffect(() => {
    if (mode !== 'css') return
    const t = setTimeout(() => done.current(), reducedMotion() ? REDUCED_MS : BURN_MS)
    return () => clearTimeout(t)
  }, [mode])

  const css = mode === 'css'
  return (
    <div
      className={`burn-wrap ${css ? 'burning' : ''}`}
      data-testid="burn"
      data-burning={burning || undefined}
      data-fire={mode ?? undefined}
    >
      <div className="burn-target" ref={targetRef}>
        {children}
      </div>
      {mode === 'webgl' && targetRef.current && loadTexture && (
        <BurnCanvas coverEl={targetRef.current} loadTexture={loadTexture} onDone={() => done.current()} onFallback={() => setMode('css')} />
      )}
      {css && (
        <>
          <div className="burn-scorch" aria-hidden="true" />
          <svg width="0" height="0" className="absolute" aria-hidden="true">
            <defs>
              <linearGradient id={`${id}-outer`} x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#ff5a00" />
                <stop offset="45%" stopColor="#ff8c1a" />
                <stop offset="80%" stopColor="#ff3d00" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#ff2200" stopOpacity="0" />
              </linearGradient>
              <linearGradient id={`${id}-core`} x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#fffbe6" />
                <stop offset="55%" stopColor="#ffe36e" />
                <stop offset="100%" stopColor="#ffb300" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
          <div className="burn-flames" aria-hidden="true">
            {FLAMES.map((f, i) => (
              <svg
                key={i}
                className="flame"
                viewBox="0 0 100 160"
                preserveAspectRatio="none"
                style={{
                  left: `${f.left}%`,
                  width: `${f.width}%`,
                  height: `${f.height}%`,
                  animationDelay: `${f.delay}s`,
                  animationDuration: `${0.24 + (i % 4) * 0.05}s`
                }}
              >
                <path d={FLAME_PATH} fill={`url(#${id}-outer)`} />
                <path d={CORE_PATH} fill={`url(#${id}-core)`} />
              </svg>
            ))}
          </div>
          <div className="burn-edge" aria-hidden="true" />
          {EMBERS.map((e, i) => (
            <span
              key={i}
              className="ember"
              aria-hidden="true"
              style={{ left: `${e.left}%`, animationDelay: `${e.delay}s`, ['--drift' as string]: `${e.drift}px` }}
            />
          ))}
          {SMOKE.map((s, i) => (
            <span key={i} className="smoke" aria-hidden="true" style={{ left: `${s.left}%`, animationDelay: `${s.delay}s` }} />
          ))}
          <span role="status" className="sr-only">
            Burning the book&hellip;
          </span>
        </>
      )}
    </div>
  )
}
