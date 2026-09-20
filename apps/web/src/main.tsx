import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'hbar-app-ui/theme.css'
import App from './App'
import { loadNativeConnection } from './native-connection'
import { resolveShellLocale } from './shell-copy'
import { applyWebTheme, readThemeBootstrap, resolveWebTheme } from './theme'
import './document.css'

const locale = resolveShellLocale(navigator.languages)
document.documentElement.lang = locale
applyWebTheme(
  document.documentElement,
  resolveWebTheme(readThemeBootstrap(window.localStorage), window.matchMedia('(prefers-color-scheme: dark)').matches),
)

const root = document.getElementById('root')
if (!root) throw new Error('Missing application root')
const nativeConnection = await loadNativeConnection(window, window.location.origin).catch((error: unknown) => {
  console.error('Unable to read the native hbar connection', error)
  return null
})
createRoot(root).render(
  <StrictMode>
    <App locale={locale} nativeConnection={nativeConnection ?? undefined} />
  </StrictMode>,
)
