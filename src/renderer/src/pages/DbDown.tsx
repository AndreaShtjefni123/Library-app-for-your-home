import { useState } from 'react'
import { ArrowClockwiseIcon, DatabaseIcon, PlayIcon } from '@phosphor-icons/react'
import { Button } from '../components/PageHeader'

interface DbDownProps {
  message?: string
  onRetry: () => Promise<void>
}

/** Shown instead of crashing when PostgreSQL isn't reachable. */
export function DbDownPage({ message, onRetry }: DbDownProps) {
  const [busy, setBusy] = useState<'start' | 'retry' | null>(null)
  const [note, setNote] = useState<string>()

  const start = async (): Promise<void> => {
    setBusy('start')
    setNote(undefined)
    const result = await window.api.db.startService()
    if (!result.ok) setNote(result.message)
    await onRetry()
    setBusy(null)
  }

  const retry = async (): Promise<void> => {
    setBusy('retry')
    await onRetry()
    setBusy(null)
  }

  return (
    <div className="grid flex-1 place-content-center p-10">
      <div className="max-w-md text-center">
        <DatabaseIcon size={48} weight="duotone" className="mx-auto text-muted" />
        <h1 className="mt-4 mb-2 font-display text-3xl font-semibold">Your library&rsquo;s database isn&rsquo;t running</h1>
        <p className="m-0 text-muted">
          {message ??
            'Home Library keeps your books in PostgreSQL on this PC. It usually starts with Windows, but it seems to be stopped right now.'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={start} disabled={busy !== null}>
            <PlayIcon size={16} weight="fill" /> {busy === 'start' ? 'Starting…' : 'Start database'}
          </Button>
          <Button variant="secondary" onClick={retry} disabled={busy !== null}>
            <ArrowClockwiseIcon size={16} /> {busy === 'retry' ? 'Checking…' : 'Retry'}
          </Button>
        </div>
        {note && <p className="mt-4 text-[14px] text-danger">{note}</p>}
        <p className="mt-6 text-[13px] text-muted">
          Windows will ask for permission to start it. You can also start &ldquo;postgresql-x64-17&rdquo; from the Services app.
        </p>
      </div>
    </div>
  )
}
