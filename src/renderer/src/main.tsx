import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { UI_STORAGE_KEY } from './stores/ui'
import './styles.css'

// Set light/dark before the first paint so the splash never flashes the wrong colours.
try {
  const saved = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) ?? '{}')
  document.documentElement.dataset.mode = saved?.state?.mode === 'dark' ? 'dark' : 'light'
} catch {
  document.documentElement.dataset.mode = 'light'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
