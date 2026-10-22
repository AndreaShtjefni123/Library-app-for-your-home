import type { ThemeMode } from '../shared/ipc'

/** Colours for the window frame; they mirror --bg and --ink in the renderer's tokens.css. */
export const frameColours: Record<ThemeMode, { bg: string; symbols: string }> = {
  light: { bg: '#f7f7f5', symbols: '#1f1f1d' },
  dark: { bg: '#18181a', symbols: '#ececea' }
}

export const TITLE_BAR_HEIGHT = 36
