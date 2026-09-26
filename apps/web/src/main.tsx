import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@lumen/app-ui/styles.css'
import { applyLumenAppearance } from '@lumen/app-ui'
import { LanguageApp } from './LanguageApp'
import { createWebLanguageController } from './language'
import { createWebLumenAppearance, readAppearanceBootstrap } from './appearance'
import { loadNativeConnection } from './native-connection'
import { applyNativeWindowContext, readNativeWindowContext } from './native-window'
import { resolveShellLocale } from './shell-copy'
import { applyWebTheme, readThemeBootstrap, resolveWebTheme } from './theme'
import './document.css'

const language = createWebLanguageController(resolveShellLocale(navigator.languages), {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
})
document.documentElement.lang = language.store.getState().locale
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
    <LanguageApp
      language={language}
      nativeConnection={nativeConnection ?? undefined}
      nativeWindow={nativeWindow ?? undefined}
    />
  </StrictMode>,
)
