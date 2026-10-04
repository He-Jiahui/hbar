export type WebThemePreference = 'system' | 'light' | 'dark'
export type WebResolvedTheme = Exclude<WebThemePreference, 'system'>

export const WEB_THEME_STORAGE_KEY = 'hbar:web:theme'

interface ThemeStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

interface ThemeRoot {
  readonly dataset: DOMStringMap
  readonly style: Pick<CSSStyleDeclaration, 'colorScheme'>
}

export function readThemePreference(value: unknown): WebThemePreference | null {
  return value === 'system' || value === 'light' || value === 'dark' ? value : null
}

export function resolveWebTheme(preference: WebThemePreference, systemPrefersDark: boolean): WebResolvedTheme {
  return preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference
}

export function readThemeBootstrap(storage: ThemeStorage): WebThemePreference {
  try {
    return readThemePreference(storage.getItem(WEB_THEME_STORAGE_KEY)) ?? 'system'
  } catch {
    return 'system'
  }
}

export function writeThemeBootstrap(storage: ThemeStorage, preference: WebThemePreference): boolean {
  try {
    storage.setItem(WEB_THEME_STORAGE_KEY, preference)
    return true
  } catch {
    return false
  }
}

export function applyWebTheme(root: ThemeRoot, theme: WebResolvedTheme): void {
  root.dataset.hbarAppUiTheme = theme
  root.style.colorScheme = theme
}
