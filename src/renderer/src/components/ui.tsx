import { useEffect, useRef, type ReactNode } from 'react'
import { XIcon } from '@phosphor-icons/react'

/** A centred dialog. Esc or the backdrop closes it; focus moves inside while open. */
export function Modal({
  title,
  onClose,
  children,
  wide = false
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-6" onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-2xl border border-border bg-surface p-6 shadow-2xl`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="m-0 font-display text-2xl font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-bg hover:text-ink" aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const value = Math.max(0, Math.min(100, percent))
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-border"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      aria-label={label ?? 'Reading progress'}
    >
      <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${value}%` }} />
    </div>
  )
}

/** A row of buttons where exactly one is chosen. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-bg p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-md px-3 text-[13px] transition ${
            value === o.value ? 'bg-surface font-medium text-ink shadow-sm' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const fieldClass =
  'h-10 w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink outline-none placeholder:text-muted/70 focus:border-accent aria-[invalid=true]:border-danger'

export function Field({
  label,
  error,
  hint,
  children,
  className = ''
}: {
  label: string
  error?: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[13px] font-medium">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="mt-1 block text-[12px] text-danger">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] text-muted">{hint}</span>
      ) : null}
    </label>
  )
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function progressText(b: { currentPage: number | null; pages: number | null; progressPercent: number | null }): string {
  const pct = b.progressPercent === null ? null : `${Math.round(b.progressPercent)}%`
  if (b.currentPage !== null && b.pages) return `page ${b.currentPage} of ${b.pages}${pct ? ` · ${pct}` : ''}`
  return pct ?? 'No progress logged'
}
