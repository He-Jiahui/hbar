import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './settings-models.css'
import './gallery-theme.css'
import './react-bits/theme.css'
import './react-bits/semantic.css'
import './react-bits/production.css'
import ReferenceFixtureRoute, { referenceFixtureRouteFromLocation } from './react-bits/reference/ReferenceFixtureRoute'

function initialTheme(): 'dsh-dark' | 'dsh-light' | 'white' {
  try {
    const raw = localStorage.getItem('hbar.workbench.v1')
    const persisted = raw ? (JSON.parse(raw) as { state?: { theme?: unknown } }) : undefined
    if (persisted?.state?.theme === 'light') return 'dsh-light'
    if (persisted?.state?.theme === 'white') return 'white'
    if (persisted?.state?.theme === 'custom') return 'dsh-dark'
  } catch {
    // A blocked or malformed storage entry should not prevent the app from booting.
  }
  return 'dsh-dark'
}

document.documentElement.dataset.theme = initialTheme()

const fixtureRoute = referenceFixtureRouteFromLocation()
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {fixtureRoute ? <ReferenceFixtureRoute {...fixtureRoute} /> : <App />}
  </React.StrictMode>,
)
