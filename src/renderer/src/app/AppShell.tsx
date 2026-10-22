import { createContext, useContext, useEffect, useRef, type RefObject } from 'react'
import { Outlet } from 'react-router'
import { Sidebar } from './Sidebar'
import { useUi } from '../stores/ui'

/** The scrolling page area, for lists that only draw what's on screen. */
const ScrollContext = createContext<RefObject<HTMLElement | null> | null>(null)
export const useScrollElement = (): RefObject<HTMLElement | null> => useContext(ScrollContext)!

export function AppShell() {
  const scrollRef = useRef<HTMLElement>(null)
  const toggleSidebar = useUi((s) => s.toggleSidebar)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleSidebar])

  return (
    <div className="flex min-h-0 flex-1">
      <Sidebar />
      <main ref={scrollRef} className="relative min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-10 py-10">
          <ScrollContext.Provider value={scrollRef}>
            <Outlet />
          </ScrollContext.Provider>
        </div>
      </main>
    </div>
  )
}
