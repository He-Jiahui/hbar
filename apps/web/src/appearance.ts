import {
  DEFAULT_HBAR_APP_UI_APPEARANCE,
  HBAR_APP_UI_APPEARANCE_KEYS,
  resolveHbarAppUiAppearance,
  type HbarAppUiAppearance,
} from 'hbar-app-ui/appearance'
import type { LumenAppearance } from '@lumen/app-ui'
import { readThemePreference, type WebResolvedTheme, type WebThemePreference } from './theme'

export interface WebAppearancePreferences extends HbarAppUiAppearance {
  readonly theme: WebThemePreference
}

export interface PreferenceMutationResult {
  readonly revision: number
  readonly values: Readonly<Record<string, unknown>>
}

export interface PreferenceMutationPort {
  set(input: { readonly key: string; readonly value: string; readonly expectedRevision: number }): Promise<PreferenceMutationResult>
  unset(input: { readonly key: string; readonly expectedRevision: number }): Promise<PreferenceMutationResult>
}

interface AppearanceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const WEB_APPEARANCE_STORAGE_KEY = 'hbar:web:appearance'

export const DEFAULT_WEB_APPEARANCE_PREFERENCES: WebAppearancePreferences = Object.freeze({
  theme: 'system',
  ...DEFAULT_HBAR_APP_UI_APPEARANCE,
})

export const WEB_APPEARANCE_PREFERENCE_KEYS = Object.freeze([
  'theme',
  HBAR_APP_UI_APPEARANCE_KEYS.controlSize,
  HBAR_APP_UI_APPEARANCE_KEYS.textSize,
  HBAR_APP_UI_APPEARANCE_KEYS.cornerSize,
] as const)

export function resolveWebAppearancePreferences(
  values: Readonly<Record<string, unknown>>,
): WebAppearancePreferences {
  return {
    theme: readThemePreference(values.theme) ?? DEFAULT_WEB_APPEARANCE_PREFERENCES.theme,
    ...resolveHbarAppUiAppearance(values),
  }
}

export function sameWebAppearance(
  left: WebAppearancePreferences,
  right: WebAppearancePreferences,
): boolean {
  return (
    left.theme === right.theme &&
    left.controlSize === right.controlSize &&
    left.textSize === right.textSize &&
    left.cornerSize === right.cornerSize
  )
}

export function sameHbarAppUiAppearance(left: HbarAppUiAppearance, right: HbarAppUiAppearance): boolean {
  return (
    left.controlSize === right.controlSize && left.textSize === right.textSize && left.cornerSize === right.cornerSize
  )
}

export function createWebLumenAppearance(
  mode: WebResolvedTheme,
  appearance: HbarAppUiAppearance,
  motion: boolean,
): LumenAppearance {
  return {
    mode,
    controlSize: appearance.controlSize,
    textSize: appearance.textSize,
    cornerSize: appearance.cornerSize,
    shape: 'rounded',
    glow: 65,
    motion,
  }
}

export function readAppearanceBootstrap(storage: AppearanceStorage): HbarAppUiAppearance {
  try {
    const raw = storage.getItem(WEB_APPEARANCE_STORAGE_KEY)
    if (!raw) return DEFAULT_HBAR_APP_UI_APPEARANCE
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return DEFAULT_HBAR_APP_UI_APPEARANCE
    const value = parsed as Readonly<Record<string, unknown>>
    return resolveHbarAppUiAppearance({
      [HBAR_APP_UI_APPEARANCE_KEYS.controlSize]: value.controlSize,
      [HBAR_APP_UI_APPEARANCE_KEYS.textSize]: value.textSize,
      [HBAR_APP_UI_APPEARANCE_KEYS.cornerSize]: value.cornerSize,
    })
  } catch {
    return DEFAULT_HBAR_APP_UI_APPEARANCE
  }
}

export function writeAppearanceBootstrap(storage: AppearanceStorage, appearance: HbarAppUiAppearance): boolean {
  try {
    storage.setItem(WEB_APPEARANCE_STORAGE_KEY, JSON.stringify(appearance))
    return true
  } catch {
    return false
  }
}

function preferenceEntries(preferences: WebAppearancePreferences): readonly (readonly [string, string])[] {
  return [
    ['theme', preferences.theme],
    [HBAR_APP_UI_APPEARANCE_KEYS.controlSize, preferences.controlSize],
    [HBAR_APP_UI_APPEARANCE_KEYS.textSize, preferences.textSize],
    [HBAR_APP_UI_APPEARANCE_KEYS.cornerSize, preferences.cornerSize],
  ]
}

export async function saveWebAppearancePreferences(
  port: PreferenceMutationPort,
  currentValues: Readonly<Record<string, unknown>>,
  preferences: WebAppearancePreferences,
  expectedRevision: number,
): Promise<PreferenceMutationResult> {
  let result: PreferenceMutationResult = { revision: expectedRevision, values: currentValues }
  for (const [key, value] of preferenceEntries(preferences)) {
    if (result.values[key] === value) continue
    result = await port.set({ key, value, expectedRevision: result.revision })
  }
  return result
}

export async function resetWebAppearancePreferences(
  port: PreferenceMutationPort,
  currentValues: Readonly<Record<string, unknown>>,
  expectedRevision: number,
): Promise<PreferenceMutationResult> {
  let result: PreferenceMutationResult = { revision: expectedRevision, values: currentValues }
  for (const key of WEB_APPEARANCE_PREFERENCE_KEYS) {
    if (!Object.hasOwn(result.values, key)) continue
    result = await port.unset({ key, expectedRevision: result.revision })
  }
  return result
}

export function hasWebAppearanceOverrides(values: Readonly<Record<string, unknown>>): boolean {
  return WEB_APPEARANCE_PREFERENCE_KEYS.some((key) => Object.hasOwn(values, key))
}
