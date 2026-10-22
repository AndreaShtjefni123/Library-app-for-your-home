import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="mb-8 flex items-end justify-between gap-6">
      <div>
        <h1 className="m-0 font-display text-4xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  )
}

/** Placeholder card for sections that arrive in a later roadmap step. */
export function ComingSoon({ step, children }: { step: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface/60 p-8 text-muted">
      <p className="m-0">{children}</p>
      <p className="mt-3 text-[13px]">Arrives in roadmap step {step}.</p>
    </div>
  )
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="m-0 mb-4 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">{title}</h2>
      {children}
    </section>
  )
}

export function Button({
  children,
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  const styles =
    variant === 'primary'
      ? 'bg-accent text-accent-ink hover:opacity-90'
      : 'border border-border bg-surface text-ink hover:bg-bg'
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-[14px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${props.className ?? ''}`}
    >
      {children}
    </button>
  )
}
