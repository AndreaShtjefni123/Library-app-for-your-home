import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ThemeMode } from '../../../shared/ipc'

/** Design of the made-up covers for books without a picture ("auto" = varied by title). */
export type CoverLayout = 'auto' | 'band' | 'plate' | 'geo'

interface UiState {
  mode: ThemeMode
  sidebarCollapsed: boolean
  coverLayout: CoverLayout
  setCoverLayout: (layout: CoverLayout) => void
  setMode: (mode: ThemeMode) => void
  toggleMode: () => void
  toggleSidebar: () => void
}

export const UI_STORAGE_KEY = 'home-library-ui'

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      mode: 'light',
      sidebarCollapsed: false,
      coverLayout: 'auto',
      setCoverLayout: (coverLayout) => set({ coverLayout }),
      setMode: (mode) => set({ mode }),
      toggleMode: () => set({ mode: get().mode === 'light' ? 'dark' : 'light' }),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed })
    }),
    { name: UI_STORAGE_KEY }
  )
)

/** Applies the mode to the page and the window frame. */
export function applyMode(mode: ThemeMode): void {
  document.documentElement.dataset.mode = mode
  window.api?.setTheme(mode).catch(() => {})
}
