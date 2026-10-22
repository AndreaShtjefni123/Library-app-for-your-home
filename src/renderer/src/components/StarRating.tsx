import { useState, type KeyboardEvent } from 'react'
import { StarIcon } from '@phosphor-icons/react'

interface StarRatingProps {
  value: number | null
  onChange: (value: number | null) => void
  size?: number
  label?: string
}

/** ½ to 5 stars. Hover to preview, click to set, click the same value again to clear. Arrow keys work too. */
export function StarRating({ value, onChange, size = 22, label = 'Your rating' }: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0

  const set = (v: number): void => onChange(v === value ? null : v)
  const onKey = (e: KeyboardEvent): void => {
    const current = value ?? 0
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(5, current + 0.5))
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(current <= 0.5 ? null : current - 0.5)
    else if (e.key === 'Delete' || e.key === 'Backspace' || e.key === '0') onChange(null)
    else return
    e.preventDefault()
  }

  return (
    <div className="inline-flex items-center gap-2">
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={value ?? 0}
        aria-valuetext={value ? `${value} out of 5 stars` : 'Not rated'}
        onKeyDown={onKey}
        onMouseLeave={() => setHover(null)}
        className="inline-flex rounded-md"
        data-testid="star-rating"
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = shown >= star ? 1 : shown >= star - 0.5 ? 0.5 : 0
          return (
            <span key={star} className="relative inline-block" style={{ width: size, height: size }}>
              <StarIcon size={size} weight="regular" className="absolute inset-0 text-gilt/60" />
              {fill > 0 && (
                <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: fill === 1 ? size : size / 2 }}>
                  <StarIcon size={size} weight="fill" className="text-gilt" />
                </span>
              )}
              {/* Two click areas per star: left half = ½, right half = whole. */}
              <button
                type="button"
                tabIndex={-1}
                aria-label={`${star - 0.5} stars`}
                className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
                onMouseEnter={() => setHover(star - 0.5)}
                onClick={() => set(star - 0.5)}
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={`${star} stars`}
                className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
                onMouseEnter={() => setHover(star)}
                onClick={() => set(star)}
              />
            </span>
          )
        })}
      </div>
      <span className="w-8 text-[13px] tabular-nums text-muted">{shown ? shown.toFixed(1) : ''}</span>
    </div>
  )
}
