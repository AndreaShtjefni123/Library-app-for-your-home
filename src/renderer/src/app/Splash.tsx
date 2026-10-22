import { useEffect, useRef, useState } from 'react'

export const SPLASH_TITLE = 'Home Library'
const LETTER_STAGGER_MS = 55
const ANIMATION_MS = 1900
const REDUCED_MS = 400
const FADE_OUT_MS = 450

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface SplashProps {
  /** True once the app has finished loading (database connected or a screen chosen). */
  ready: boolean
  onDone: () => void
}

/**
 * The opening title. It stays up until both the animation has played and the app is ready,
 * so it hides loading time instead of adding to it. A click or any key skips the animation.
 */
export function Splash({ ready, onDone }: SplashProps) {
  const reduced = useRef(prefersReducedMotion()).current
  const [skipped, setSkipped] = useState(reduced)
  const [animDone, setAnimDone] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (skipped) {
      const t = setTimeout(() => setAnimDone(true), reduced ? REDUCED_MS : 0)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setAnimDone(true), ANIMATION_MS)
    return () => clearTimeout(t)
  }, [skipped, reduced])

  useEffect(() => {
    const skip = (): void => setSkipped(true)
    window.addEventListener('keydown', skip)
    return () => window.removeEventListener('keydown', skip)
  }, [])

  useEffect(() => {
    if (!animDone || !ready) return
    setLeaving(true)
    const t = setTimeout(onDone, reduced ? 150 : FADE_OUT_MS)
    return () => clearTimeout(t)
  }, [animDone, ready, onDone, reduced])

  return (
    <div
      className={`splash${skipped ? ' skipped' : ''}${leaving ? ' leaving' : ''}`}
      onClick={() => setSkipped(true)}
      role="status"
      aria-label={`${SPLASH_TITLE} is opening`}
      data-testid="splash"
    >
      <h1 className="splash-title text-ink" aria-hidden="true">
        {[...SPLASH_TITLE].map((ch, i) => (
          <span key={i} className="splash-letter" style={{ animationDelay: `${i * LETTER_STAGGER_MS}ms` }}>
            {ch}
          </span>
        ))}
      </h1>
      <svg className="splash-line" viewBox="0 0 100 2" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="1" x2="100" y2="1" pathLength={100} />
      </svg>
      <p className="splash-hint">{animDone && !ready ? 'Opening your library…' : ' '}</p>
    </div>
  )
}
