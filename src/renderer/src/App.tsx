import { useCallback, useEffect, useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { queryClient, refreshBooks } from './lib/queries'
import { BookDetailPage } from './pages/BookDetail'
import { AddBookPage, EditBookPage } from './pages/EditBook'
import { DiscoverPage } from './pages/Discover'
import { DiscoverBookPage } from './pages/DiscoverBook'
import type { DbStatus } from '../../shared/ipc'
import { Splash } from './app/Splash'
import { TitleBar } from './app/TitleBar'
import { AppShell } from './app/AppShell'
import { applyMode, useUi } from './stores/ui'
import { DbDownPage } from './pages/DbDown'
import { SetupPage } from './pages/Setup'
import { SettingsPage } from './pages/Settings'
import {
  HomePage,
  LibraryPage,
  ShelfPage,
  StatsPage
} from './pages/Placeholders'

function Screen({ status, refresh }: { status: DbStatus; refresh: () => Promise<void> }) {
  switch (status.state) {
    case 'ok':
      return (
        <QueryClientProvider client={queryClient}>
          <HashRouter>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<HomePage />} />
                <Route path="discover" element={<DiscoverPage />} />
                <Route path="discover/book" element={<DiscoverBookPage />} />
                <Route path="library" element={<LibraryPage />} />
                <Route path="shelf/:shelf" element={<ShelfPage />} />
                <Route path="add" element={<AddBookPage />} />
                <Route path="book/:id" element={<BookDetailPage />} />
                <Route path="book/:id/edit" element={<EditBookPage />} />
                <Route path="stats" element={<StatsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<HomePage />} />
              </Route>
            </Routes>
          </HashRouter>
        </QueryClientProvider>
      )
    case 'no_config':
      return <SetupPage onDone={refresh} />
    case 'auth_failed':
      return (
        <SetupPage
          onDone={refresh}
          reason="The app's saved login was not accepted any more. Enter your PostgreSQL password to reconnect."
        />
      )
    case 'db_missing':
      return <SetupPage onDone={refresh} reason={`The database “${status.database}” was not found. Choose your library database.`} />
    case 'not_running':
      return <DbDownPage onRetry={refresh} />
    case 'error':
      return <DbDownPage onRetry={refresh} message={status.message} />
  }
}

export default function App() {
  const mode = useUi((s) => s.mode)
  const [status, setStatus] = useState<DbStatus | null>(null)
  const [splashDone, setSplashDone] = useState(false)

  useEffect(() => applyMode(mode), [mode])

  const refresh = useCallback(async () => {
    try {
      setStatus(await window.api.db.status())
    } catch (e) {
      setStatus({ state: 'error', message: (e as Error).message })
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Covers download after a book is saved; show them as soon as they arrive.
  useEffect(() => window.api.onBooksChanged(() => void refreshBooks()), [])

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      {status && <Screen status={status} refresh={refresh} />}
      <Toaster position="bottom-right" theme={mode} richColors closeButton />
      {!splashDone && <Splash ready={status !== null} onDone={() => setSplashDone(true)} />}
    </div>
  )
}
