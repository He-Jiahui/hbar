import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './settings-models.css'
import './gallery-theme.css'
import './react-bits/theme.css'

function initialTheme(): 'dsh-dark' | 'dsh-light' | 'white' {
  try {
    const raw = localStorage.getItem('hbar.workbench.v1')
    const persisted = raw ? (JSON.parse(raw) as { state?: { theme?: unknown } }) : undefined
    if (persisted?.state?.theme === 'light') return 'dsh-light'
    if (persisted?.state?.theme === 'white') return 'white'
  } catch {
    // A blocked or malformed storage entry should not prevent the app from booting.
  }
  return 'dsh-dark'
}

document.documentElement.dataset.theme = initialTheme()

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
