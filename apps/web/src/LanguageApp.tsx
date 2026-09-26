import { useEffect } from 'react'
import { useStore } from 'zustand'
import App from './App'
import { WEB_LANGUAGE_STORAGE_KEY, type WebLanguageController } from './language'
import { resolveShellLocale } from './shell-copy'
import type { HbarNativeConnection } from './native-connection'
import type { HbarNativeWindowContext } from './native-window'

export function LanguageApp({
  language,
  nativeConnection,
  nativeWindow,
}: {
  readonly language: WebLanguageController
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
  return <App locale={locale} language={language} nativeConnection={nativeConnection} nativeWindow={nativeWindow} />
}
