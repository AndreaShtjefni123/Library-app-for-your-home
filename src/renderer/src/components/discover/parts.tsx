import { CheckIcon, StarIcon, WifiHighIcon, WifiSlashIcon } from '@phosphor-icons/react'
import type { AddTarget } from '../../../../shared/catalog'
import { ADD_TARGETS, ADD_TARGET_LABELS } from '../../../../shared/catalog'
import { useOnline } from '../../lib/catalog'
import { Segmented } from '../ui'

export function OnlinePill() {
  const online = useOnline()
  return (
    <span
      role="status"
      className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium ${
        online ? 'bg-success/12 text-success' : 'bg-danger/12 text-danger'
      }`}
      data-testid="online-pill"
    >
      {online ? <WifiHighIcon size={14} weight="bold" /> : <WifiSlashIcon size={14} weight="bold" />}
      {online ? 'Online' : 'Offline'}
    </span>
  )
}

/** "Add to: Own · To-read pile · Want to buy · Currently reading · Read" */
export function TargetPicker({ value, onChange }: { value: AddTarget; onChange: (t: AddTarget) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-[13px] text-muted">Add to</span>
      <Segmented<AddTarget>
        label="Shelf to add books to"
        value={value}
        options={ADD_TARGETS.map((t) => ({ value: t, label: ADD_TARGET_LABELS[t] }))}
        onChange={onChange}
      />
    </div>
  )
}

export function InLibraryBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
      <CheckIcon size={11} weight="bold" /> In your library
    </span>
  )
}

export function Rating({ avg, count }: { avg: number | null; count: number | null }) {
  if (avg === null) return null
  return (
    <span className="inline-flex items-center gap-1 text-[14px]" title="Average rating from readers online">
      <StarIcon size={15} weight="fill" className="text-gilt" />
      <span className="font-medium tabular-nums">{avg.toFixed(1)}</span>
      {count !== null && <span className="text-muted">({count.toLocaleString()} ratings)</span>}
    </span>
  )
}
