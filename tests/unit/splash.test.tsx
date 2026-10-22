import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Splash, SPLASH_TITLE } from '../../src/renderer/src/app/Splash'

function mockReducedMotion(reduce: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }))
}

/** Moves fake time forward in small steps so React can re-render between timers. */
function advance(ms: number): void {
  for (let t = 0; t < ms; t += 50) act(() => void vi.advanceTimersByTime(50))
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Splash', () => {
  it('spells out the app name letter by letter', () => {
    mockReducedMotion(false)
    render(<Splash ready={false} onDone={() => {}} />)
    expect(screen.getByTestId('splash').textContent).toContain(SPLASH_TITLE)
  })

  it('waits for the app to be ready even after the animation', () => {
    vi.useFakeTimers()
    mockReducedMotion(false)
    const onDone = vi.fn()
    render(<Splash ready={false} onDone={onDone} />)
    advance(5000)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('finishes after the full animation once ready', () => {
    vi.useFakeTimers()
    mockReducedMotion(false)
    const onDone = vi.fn()
    render(<Splash ready onDone={onDone} />)
    advance(1800)
    expect(onDone).not.toHaveBeenCalled()
    advance(600)
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('can be skipped with a click', () => {
    vi.useFakeTimers()
    mockReducedMotion(false)
    const onDone = vi.fn()
    render(<Splash ready onDone={onDone} />)
    fireEvent.click(screen.getByTestId('splash'))
    advance(500)
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('can be skipped with any key', () => {
    vi.useFakeTimers()
    mockReducedMotion(false)
    const onDone = vi.fn()
    render(<Splash ready onDone={onDone} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    advance(500)
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('is short when Windows animations are turned off', () => {
    vi.useFakeTimers()
    mockReducedMotion(true)
    const onDone = vi.fn()
    render(<Splash ready onDone={onDone} />)
    advance(600)
    expect(onDone).toHaveBeenCalledOnce()
  })
})
