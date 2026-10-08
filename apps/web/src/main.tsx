import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@lumen/app-ui/styles.css'
import { applyLumenAppearance } from '@lumen/app-ui'
import { LanguageApp } from './LanguageApp'
import { createWebLanguageController } from './language'
import { createWebLumenAppearance, readAppearanceBootstrap } from './appearance'
import { loadNativeConnection } from './native-connection'
import { applyNativeWindowContext, readNativeWindowContext } from './native-window'
import { readNativeInvokeBridge } from './native-invoke'
import { bindDesktopChromeLanguage, createDesktopChromeController, createDesktopChromePort } from './desktop-chrome'
import { createWebZoomController } from './app-zoom'
import { createBrowserZoomPort, createNativeZoomPort } from './app-zoom-port'
import { resolveShellLocale } from './shell-copy'
import { applyWebTheme, readThemeBootstrap, resolveWebTheme } from './theme'
import './document.css'
import './react-bits/theme.css'
import './react-bits/semantic.css'
import './react-bits/production.css'
import './workbench-design.css'
import ReferenceFixtureRoute, { referenceFixtureRouteFromLocation } from './react-bits/reference/ReferenceFixtureRoute'

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
const developmentHostOrigin: unknown = import.meta.env.HBAR_NATIVE_HOST_ORIGIN
const expectedHostOrigin =
  import.meta.env.DEV && typeof developmentHostOrigin === 'string' ? developmentHostOrigin : window.location.origin
const nativeConnection = await loadNativeConnection(window, expectedHostOrigin).catch((error: unknown) => {
  console.error('Unable to read the native hbar connection', error)
  return null
})
const nativeWindow = nativeConnection ? readNativeWindowContext(new URL(window.location.href)) : null
applyNativeWindowContext(document.documentElement, nativeWindow)
const nativeBridge = readNativeInvokeBridge(window)
const desktopChrome = nativeWindow ? createDesktopChromeController(createDesktopChromePort(window, true)) : undefined
if (desktopChrome) {
  const release = bindDesktopChromeLanguage(desktopChrome, language)
  window.addEventListener(
    'pagehide',
    () => {
      release()
      desktopChrome.dispose()
    },
    { once: true },
  )
}
const zoom = createWebZoomController(
  nativeWindow && nativeConnection && nativeBridge
    ? createNativeZoomPort(nativeBridge)
    : createBrowserZoomPort(window.localStorage),
)
await zoom.initialize()

const fixtureRoute = referenceFixtureRouteFromLocation()
createRoot(root).render(
  <StrictMode>
    {fixtureRoute ? (
      <ReferenceFixtureRoute {...fixtureRoute} />
    ) : (
      <LanguageApp
        language={language}
        zoom={zoom}
        desktopChrome={desktopChrome}
        nativeConnection={nativeConnection ?? undefined}
        nativeWindow={nativeWindow ?? undefined}
      />
    )}
  </StrictMode>,
)
