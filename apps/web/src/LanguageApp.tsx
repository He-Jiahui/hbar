import { useEffect } from 'react'
import { useStore } from 'zustand'
import App from './App'
import { WEB_LANGUAGE_STORAGE_KEY, type WebLanguageController } from './language'
import { resolveShellLocale } from './shell-copy'
import { WEB_ZOOM_STORAGE_KEY, nextWebZoom, webZoomKeyboardAction, type WebZoomController } from './app-zoom'
import type { HbarNativeConnection } from './native-connection'
import type { HbarNativeWindowContext } from './native-window'
import type { DesktopChromeController } from './desktop-chrome'

export function LanguageApp({
  language,
  zoom,
  desktopChrome,
  nativeConnection,
  nativeWindow,
}: {
  readonly language: WebLanguageController
  readonly zoom: WebZoomController
  readonly desktopChrome?: DesktopChromeController | undefined
  readonly nativeConnection?: HbarNativeConnection | undefined
  readonly nativeWindow?: HbarNativeWindowContext | undefined
}) {
  const locale = useStore(language.store, (state) => state.locale)
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === window.localStorage && (event.key === WEB_LANGUAGE_STORAGE_KEY || event.key === null))
        language.refresh()
    }
    const onEnvironmentLanguage = () => language.setSystemLocale(resolveShellLocale(navigator.languages))
    window.addEventListener('storage', onStorage)
    window.addEventListener('languagechange', onEnvironmentLanguage)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('languagechange', onEnvironmentLanguage)
    }
  }, [language])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = webZoomKeyboardAction(event, navigator.platform)
      if (!action) return
      event.preventDefault()
      void zoom.select(nextWebZoom(zoom.store.getState().level, action))
    }
    const onStorage = (event: StorageEvent) => {
      if (
        !nativeConnection &&
        event.storageArea === window.localStorage &&
        (event.key === WEB_ZOOM_STORAGE_KEY || event.key === null)
      )
        void zoom.refresh()
    }
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('storage', onStorage)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('storage', onStorage)
    }
  }, [nativeConnection, zoom])
  return (
    <App
      locale={locale}
      language={language}
      zoom={zoom}
      desktopChrome={desktopChrome}
      nativeConnection={nativeConnection}
      nativeWindow={nativeWindow}
    />
  )
}
