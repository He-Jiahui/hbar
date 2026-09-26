import { createStore, type StoreApi } from 'zustand/vanilla'
import type { ShellLocale } from './shell-copy'

export type WebLanguagePreference = 'system' | ShellLocale
export const WEB_LANGUAGE_CHOICES = ['system', 'en-US', 'zh-CN'] as const
export const WEB_LANGUAGE_STORAGE_KEY = 'hbar:web:language'

export interface WebLanguageStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}
export interface WebLanguageState {
  readonly preference: WebLanguagePreference
  readonly systemLocale: ShellLocale
  readonly locale: ShellLocale
  readonly status: 'ready' | 'saved' | 'read-error' | 'save-error'
  readonly error: 'INVALID_PREFERENCE' | 'STORAGE_UNAVAILABLE' | null
}
export interface WebLanguageController {
  readonly store: StoreApi<WebLanguageState>
  readonly select: (preference: WebLanguagePreference) => void
  readonly persist: () => void
  readonly refresh: () => void
  readonly setSystemLocale: (locale: ShellLocale) => void
}

export function readLanguagePreference(value: unknown): WebLanguagePreference | null {
  return value === 'system' || value === 'en-US' || value === 'zh-CN' ? value : null
}
export function resolveWebLanguage(preference: WebLanguagePreference, systemLocale: ShellLocale): ShellLocale {
  return preference === 'system' ? systemLocale : preference
}

function read(storage: WebLanguageStorage, systemLocale: ShellLocale): WebLanguageState {
  try {
    const raw = storage.getItem(WEB_LANGUAGE_STORAGE_KEY)
    const preference = readLanguagePreference(raw) ?? 'system'
    return {
      preference,
      systemLocale,
      locale: resolveWebLanguage(preference, systemLocale),
      status: raw !== null && readLanguagePreference(raw) === null ? 'read-error' : 'ready',
      error: raw !== null && readLanguagePreference(raw) === null ? 'INVALID_PREFERENCE' : null,
    }
  } catch {
    return {
      preference: 'system',
      systemLocale,
      locale: systemLocale,
      status: 'read-error',
      error: 'STORAGE_UNAVAILABLE',
    }
  }
}

/** Device-local language is independent of Host settings, preference revisions and application runtime identity. */
export function createWebLanguageController(
  systemLocale: ShellLocale,
  storage: WebLanguageStorage,
): WebLanguageController {
  const store = createStore<WebLanguageState>(() => read(storage, systemLocale))
  const persist = () => {
    const current = store.getState()
    try {
      storage.setItem(WEB_LANGUAGE_STORAGE_KEY, current.preference)
      store.setState({ status: 'saved', error: null })
    } catch {
      // The in-window choice is already applied. Never claim it survived a reload.
      store.setState({ status: 'save-error', error: 'STORAGE_UNAVAILABLE' })
    }
  }
  return {
    store,
    select(preference) {
      if (!readLanguagePreference(preference)) return
      const current = store.getState()
      store.setState({ preference, locale: resolveWebLanguage(preference, current.systemLocale) })
      persist()
    },
    persist,
    refresh() {
      store.setState(read(storage, store.getState().systemLocale))
    },
    setSystemLocale(locale) {
      const current = store.getState()
      store.setState({ systemLocale: locale, locale: resolveWebLanguage(current.preference, locale) })
    },
  }
}
