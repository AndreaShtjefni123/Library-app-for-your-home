import { useState, type FormEvent } from 'react'
import { CaretDownIcon, CheckIcon, CircleNotchIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { DEFAULT_DATABASE, type SetupStepId } from '../../../shared/ipc'
import { Button } from '../components/PageHeader'

const STEPS: { id: SetupStepId; label: string }[] = [
  { id: 'connect', label: 'Connecting to PostgreSQL' },
  { id: 'database', label: 'Finding your database' },
  { id: 'user', label: 'Creating the app’s own login' },
  { id: 'access', label: 'Granting access' },
  { id: 'extensions', label: 'Enabling search features' },
  { id: 'tables', label: 'Creating tables' },
  { id: 'test', label: 'Testing the connection' }
]

interface SetupProps {
  /** Why setup is showing again (e.g. saved login stopped working). */
  reason?: string
  onDone: () => Promise<void>
}

const field =
  'h-10 w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink outline-none focus:border-accent'

/** First run only: asks once for the PostgreSQL password and connects to "Home Library". */
export function SetupPage({ reason, onDone }: SetupProps) {
  const [database, setDatabase] = useState(DEFAULT_DATABASE)
  const [password, setPassword] = useState('')
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState('5432')
  const [superuser, setSuperuser] = useState('postgres')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [running, setRunning] = useState(false)
  const [current, setCurrent] = useState<SetupStepId | null>(null)
  const [error, setError] = useState<{ step: SetupStepId; message: string }>()
  const [databases, setDatabases] = useState<string[]>()

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setRunning(true)
    setError(undefined)
    const result = await window.api.db.setup(
      { host, port: Number(port), database, superuser, superuserPassword: password },
      setCurrent
    )
    if (result.ok) {
      setCurrent(null)
      await onDone()
      return
    }
    setError({ step: result.step, message: result.message })
    if (result.databases) setDatabases(result.databases)
    setRunning(false)
  }

  const currentIndex = current ? STEPS.findIndex((s) => s.id === current) : -1

  return (
    <div className="flex flex-1 items-start justify-center overflow-y-auto p-10">
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl border border-border bg-surface p-8">
        <h1 className="m-0 font-display text-3xl font-semibold">Connect your library</h1>
        <p className="mt-2 mb-6 text-muted">
          {reason ??
            'One-time setup. Enter the password you chose when installing PostgreSQL. It is used only now, to give the app its own login, and is never saved.'}
        </p>

        <label className="mb-4 block">
          <span className="mb-1 block text-[13px] font-medium">Database</span>
          {databases && databases.length > 0 ? (
            <select className={field} value={database} onChange={(e) => setDatabase(e.target.value)}>
              {!databases.includes(database) && <option value={database}>{database} (not found)</option>}
              {databases.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          ) : (
            <input className={field} value={database} onChange={(e) => setDatabase(e.target.value)} required />
          )}
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-[13px] font-medium">PostgreSQL password</span>
          <input
            className={field}
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="mb-4 flex items-center gap-1 text-[13px] text-muted hover:text-ink"
          aria-expanded={showAdvanced}
        >
          <CaretDownIcon size={14} className={showAdvanced ? '' : '-rotate-90'} /> Advanced
        </button>
        {showAdvanced && (
          <div className="mb-4 grid grid-cols-3 gap-3">
            <label className="col-span-2 block">
              <span className="mb-1 block text-[13px] font-medium">Host</span>
              <input className={field} value={host} onChange={(e) => setHost(e.target.value)} required />
            </label>
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium">Port</span>
              <input className={field} inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} />
            </label>
            <label className="col-span-3 block">
              <span className="mb-1 block text-[13px] font-medium">Admin user</span>
              <input className={field} value={superuser} onChange={(e) => setSuperuser(e.target.value)} required />
            </label>
          </div>
        )}

        {(running || error) && (
          <ol className="mb-6 list-none space-y-2 p-0">
            {STEPS.map((s, i) => {
              const failed = error?.step === s.id
              const done = error ? i < STEPS.findIndex((x) => x.id === error.step) : i < currentIndex
              const active = running && s.id === current
              return (
                <li key={s.id} className={`flex items-center gap-2 text-[14px] ${done || active || failed ? '' : 'text-muted'}`}>
                  {failed ? (
                    <WarningCircleIcon size={18} className="text-danger" weight="fill" />
                  ) : done ? (
                    <CheckIcon size={18} className="text-success" weight="bold" />
                  ) : active ? (
                    <CircleNotchIcon size={18} className="animate-spin text-accent" />
                  ) : (
                    <span className="inline-block size-[18px]" />
                  )}
                  {s.label}
                </li>
              )
            })}
          </ol>
        )}

        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-danger/10 p-3 text-[14px] text-danger">
            {error.message}
          </p>
        )}

        <Button type="submit" disabled={running || !password} className="w-full">
          {running ? 'Setting up…' : 'Connect'}
        </Button>
      </form>
    </div>
  )
}
