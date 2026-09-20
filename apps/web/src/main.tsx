import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@lumen/app-ui/styles.css'
import { applyLumenAppearance } from '@lumen/app-ui'
import App from './App'
import { createWebLumenAppearance, readAppearanceBootstrap } from './appearance'
import { loadNativeConnection } from './native-connection'
import { applyNativeWindowContext, readNativeWindowContext } from './native-window'
import { resolveShellLocale } from './shell-copy'
import { applyWebTheme, readThemeBootstrap, resolveWebTheme } from './theme'
import './document.css'

const locale = resolveShellLocale(navigator.languages)
document.documentElement.lang = locale
const resolvedTheme = resolveWebTheme(
  readThemeBootstrap(window.localStorage),
  window.matchMedia('(prefers-color-scheme: dark)').matches,
)
applyWebTheme(document.documentElement, resolvedTheme)
applyLumenAppearance(
  document.documentElement,
  createWebLumenAppearance(
    resolvedTheme,
    readAppearanceBootstrap(window.localStorage),
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  ),
)

const root = document.getElementById('root')
if (!root) throw new Error('Missing application root')
const nativeConnection = await loadNativeConnection(window, window.location.origin).catch((error: unknown) => {
  console.error('Unable to read the native hbar connection', error)
  return null
})
const nativeWindow = nativeConnection ? readNativeWindowContext(new URL(window.location.href)) : null
applyNativeWindowContext(document.documentElement, nativeWindow)
createRoot(root).render(
  <StrictMode>
    <App locale={locale} nativeConnection={nativeConnection ?? undefined} nativeWindow={nativeWindow ?? undefined} />
  </StrictMode>,
)
