import { useEffect, type RefObject } from 'react'

/**
 * Makes the hovered book lean toward the cursor, with a light that follows it. One listener for
 * the whole grid (no per-book listeners, no re-renders): it only writes CSS variables on the tile.
 */
export function useBookTilt(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)')
    const fine = matchMedia('(hover: hover) and (pointer: fine)')
    let tile: HTMLElement | null = null
    let rect: DOMRect | null = null
    let raf = 0
    let x = 0
    let y = 0

    const clear = (): void => {
      if (tile) for (const p of ['--rx', '--ry', '--gx', '--gy']) tile.style.removeProperty(p)
      tile = null
      rect = null
    }
    const apply = (): void => {
      raf = 0
      if (!tile || !rect) return
      const px = Math.min(1, Math.max(0, (x - rect.left) / rect.width))
      const py = Math.min(1, Math.max(0, (y - rect.top) / rect.height))
      const s = tile.style
      s.setProperty('--ry', `${((px - 0.5) * 12).toFixed(2)}deg`)
      s.setProperty('--rx', `${((0.5 - py) * 10).toFixed(2)}deg`)
      s.setProperty('--gx', `${(px * 100).toFixed(1)}%`)
      s.setProperty('--gy', `${(py * 100).toFixed(1)}%`)
    }
    const onMove = (e: PointerEvent): void => {
      if (reduce.matches || !fine.matches) return
      const t = (e.target as Element).closest<HTMLElement>('.book-tile')
      if (t !== tile) {
        clear()
        tile = t
        // Measure the still stage, not the turning book.
        rect = t?.querySelector('.book-stage')?.getBoundingClientRect() ?? null
      }
      x = e.clientX
      y = e.clientY
      if (tile && !raf) raf = requestAnimationFrame(apply)
    }
    const onLeave = (): void => clear()
    const onScroll = (): void => {
      rect = tile?.querySelector('.book-stage')?.getBoundingClientRect() ?? null
    }

    root.addEventListener('pointermove', onMove, { passive: true })
    root.addEventListener('pointerleave', onLeave)
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    return () => {
      cancelAnimationFrame(raf)
      clear()
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [rootRef])
}
