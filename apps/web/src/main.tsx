import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { resolveShellLocale } from './shell-copy'
import 'hbar-app-ui/theme.css'
import './document.css'

const locale = resolveShellLocale(navigator.languages)
document.documentElement.lang = locale
document.documentElement.dataset.hbarAppUiTheme = 'dark'

const root = document.getElementById('root')
if (!root) throw new Error('Missing application root')
createRoot(root).render(
  <StrictMode>
    <App locale={locale} />
  </StrictMode>,
)
