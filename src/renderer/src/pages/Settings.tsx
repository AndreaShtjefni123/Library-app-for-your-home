import { useEffect, useState } from 'react'
import type { AppInfo, DbInfo } from '../../../shared/ipc'
import { Button, Card, PageHeader } from '../components/PageHeader'
import { useUi } from '../stores/ui'
import { fieldClass } from '../components/ui'
import { LAYOUTS, PlaceholderCover } from '../components/library/PlaceholderCover'
import type { CoverLayout } from '../stores/ui'
import { toast } from 'sonner'

function Row({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="flex justify-between gap-6 border-b border-border py-2 text-[14px] last:border-0">
      <span className="text-muted">{label}</span>
      <span className="select-text text-right font-medium break-all">{value ?? '…'}</span>
    </div>
  )
}

export function SettingsPage() {
  const [app, setApp] = useState<AppInfo>()
  const [db, setDb] = useState<DbInfo>()
  const [dbError, setDbError] = useState<string>()
  const { mode, setMode } = useUi()

  useEffect(() => {
    window.api.appInfo().then(setApp)
    window.api.db
      .info()
      .then(setDb)
      .catch((e: Error) => setDbError(e.message))
  }, [])

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Database">
          {dbError ? (
            <p className="m-0 text-danger">{dbError}</p>
          ) : (
            <>
              <p className="m-0 mb-3 flex items-center gap-2 text-[14px]">
                <span className="inline-block size-2 rounded-full bg-success" />
                {db ? `Connected to ${db.database} as ${db.user}` : 'Checking…'}
              </p>
              <Row label="Database" value={db?.database} />
              <Row label="Server" value={db && `PostgreSQL ${db.serverVersion} on ${db.host}:${db.port}`} />
              <Row label="App login" value={db?.user} />
              <Row label="Schema version" value={db?.schemaVersion} />
            </>
          )}
        </Card>

        <Card title="About">
          <Row label="App" value={app?.name} />
          <Row label="Version" value={app?.version} />
          <Row label="Data folder" value={app?.dataFolder} />
        </Card>

        <GoogleKeyCard />

        <ReadingCard />

        <CoversCard />

        <Card title="Appearance">
          <div className="flex gap-2" role="radiogroup" aria-label="Colour mode">
            {(['light', 'dark'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={`h-10 flex-1 rounded-lg border text-[14px] capitalize ${
                  mode === m ? 'border-accent bg-accent-soft font-medium' : 'border-border hover:bg-bg'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <p className="mt-3 mb-0 text-[13px] text-muted">
            The final look (Reading Room, Gallery or Dark Academia) is chosen in roadmap step 7.9.
          </p>
        </Card>
      </div>
    </>
  )
}

/** Google Books often refuses requests without a key; a free key from Google fixes that. */
function GoogleKeyCard() {
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    window.api.settings.getGoogleKey().then((k) => {
      setSaved(k)
      setKey(k ?? '')
    })
  }, [])

  const save = async (): Promise<void> => {
    try {
      await window.api.settings.setGoogleKey(key.trim())
      setSaved(key.trim() || null)
      toast.success(key.trim() ? 'Google Books key saved' : 'Google Books key removed')
    } catch {
      toast.error('That doesn’t look like a Google API key')
    }
  }

  return (
    <Card title="Online search">
      <p className="mt-0 text-[14px]">
        Books are searched on <strong>Open Library</strong> (free, no key needed) and <strong>Google Books</strong>.
      </p>
      <p className="text-[14px] text-muted">
        Google Books often refuses requests without a key. A free key fixes that. In Google Cloud Console: create a
        project, enable &ldquo;Books API&rdquo;, then under Credentials choose &ldquo;Create credentials &rarr; API key&rdquo;.
      </p>
      <label className="block">
        <span className="mb-1 block text-[13px] font-medium">Google Books API key {saved ? '(saved)' : '(optional)'}</span>
        <div className="flex gap-2">
          <input
            className={fieldClass}
            type={show ? 'text' : 'password'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="AIza&hellip;"
            autoComplete="off"
            spellCheck={false}
          />
          <Button variant="secondary" onClick={() => setShow(!show)}>
            {show ? 'Hide' : 'Show'}
          </Button>
          <Button onClick={save} disabled={key.trim() === (saved ?? '')}>
            Save
          </Button>
        </div>
      </label>
    </Card>
  )
}

function ReadingCard() {
  const [days, setDays] = useState<string>('')
  useEffect(() => {
    window.api.mine.suggestDays().then((d) => setDays(String(d)))
  }, [])
  const save = async (value: string): Promise<void> => {
    const n = Math.round(Number(value))
    if (!Number.isFinite(n) || n < 1 || n > 365) return
    await window.api.mine.setSuggestDays(n)
    toast.success(`Will suggest Partly read after ${n} days`)
  }
  return (
    <Card title="Reading">
      <label className="flex flex-wrap items-center gap-2 text-[14px]">
        Suggest moving a book to <strong>Partly read</strong> after
        <input
          className={`${fieldClass} !w-20`}
          type="number"
          min="1"
          max="365"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          onBlur={(e) => save(e.target.value)}
          aria-label="Days without progress"
        />
        days without progress.
      </label>
    </Card>
  )
}

function CoversCard() {
  const { coverLayout, setCoverLayout } = useUi()
  const options: { value: CoverLayout; label: string }[] = [{ value: 'auto', label: 'Mixed' }, ...LAYOUTS]
  return (
    <Card title="Made-up covers">
      <p className="mt-0 text-[14px] text-muted">For books without a cover picture.</p>
      <div className="grid grid-cols-4 gap-3" role="radiogroup" aria-label="Made-up cover design">
        {options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={coverLayout === o.value}
            onClick={() => setCoverLayout(o.value)}
            className={`rounded-xl border p-2 text-center text-[12px] ${coverLayout === o.value ? 'border-accent bg-accent-soft font-medium' : 'border-border hover:bg-bg'}`}
          >
            <div className="pointer-events-none mx-auto mb-2 w-14">
              <PreviewCover layout={o.value} index={i} />
            </div>
            {o.label}
          </button>
        ))}
      </div>
    </Card>
  )
}

/** A tiny sample cover in a given design. */
function PreviewCover({ layout, index }: { layout: CoverLayout; index: number }) {
  const titles = ['The Quiet Orchard', 'A Map of Winter', 'Glass Harbour', 'Northern Letters']
  return <PlaceholderCover title={titles[index]} author="A. Writer" size="sm" layout={layout} />
}
