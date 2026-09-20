import { expect, test } from 'bun:test'
import {
  applyWebTheme,
  readThemeBootstrap,
  readThemePreference,
  resolveWebTheme,
  WEB_THEME_STORAGE_KEY,
  writeThemeBootstrap,
} from '../apps/web/src/theme'

test('web theme preference validates and resolves explicit or system modes', () => {
  expect(readThemePreference('system')).toBe('system')
  expect(readThemePreference('light')).toBe('light')
  expect(readThemePreference('dark')).toBe('dark')
  expect(readThemePreference('sepia')).toBeNull()
  expect(readThemePreference({ theme: 'dark' })).toBeNull()
  expect(resolveWebTheme('system', true)).toBe('dark')
  expect(resolveWebTheme('system', false)).toBe('light')
  expect(resolveWebTheme('light', true)).toBe('light')
  expect(resolveWebTheme('dark', false)).toBe('dark')
})

test('web theme bootstrap is bounded and the resolved theme updates document metadata', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
  expect(readThemeBootstrap(storage)).toBe('system')
  expect(writeThemeBootstrap(storage, 'light')).toBe(true)
  expect(values.get(WEB_THEME_STORAGE_KEY)).toBe('light')
  expect(readThemeBootstrap(storage)).toBe('light')
  values.set(WEB_THEME_STORAGE_KEY, 'unsupported')
  expect(readThemeBootstrap(storage)).toBe('system')

  const root = { dataset: {} as DOMStringMap, style: { colorScheme: '' } }
  applyWebTheme(root, 'dark')
  expect(root.dataset.hbarAppUiTheme).toBe('dark')
  expect(root.style.colorScheme).toBe('dark')
  applyWebTheme(root, 'light')
  expect(root.dataset.hbarAppUiTheme).toBe('light')
  expect(root.style.colorScheme).toBe('light')
})

test('web theme bootstrap tolerates unavailable browser storage', () => {
  const storage = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
  }
  expect(readThemeBootstrap(storage)).toBe('system')
  expect(writeThemeBootstrap(storage, 'dark')).toBe(false)
})
