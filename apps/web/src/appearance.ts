import { DEFAULT_LUMEN_APPEARANCE, LUMEN_SIZES, type LumenAppearance, type LumenSize } from '@lumen/app-ui'
import { readThemePreference, type WebResolvedTheme, type WebThemePreference } from './theme'

export interface WebAppearanceDimensions {
  readonly controlSize: LumenSize
  readonly textSize: LumenSize
  readonly cornerSize: LumenSize
}

export interface WebAppearancePreferences extends WebAppearanceDimensions {
  readonly theme: WebThemePreference
}

export interface PreferenceMutationResult {
  readonly revision: number
  readonly values: Readonly<Record<string, unknown>>
  readonly persisted?: boolean
}

export interface PreferenceMutationPort {
  set(input: {
    readonly key: string
    readonly value: string
    readonly expectedRevision: number
  }): Promise<PreferenceMutationResult>
  unset(input: { readonly key: string; readonly expectedRevision: number }): Promise<PreferenceMutationResult>
}

interface AppearanceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const WEB_APPEARANCE_DIMENSION_KEYS = Object.freeze({
  controlSize: 'appearance.controlSize',
  textSize: 'appearance.textSize',
  cornerSize: 'appearance.cornerSize',
} as const)

export const WEB_APPEARANCE_STORAGE_KEY = 'hbar:web:appearance'

export const DEFAULT_WEB_APPEARANCE_DIMENSIONS: Readonly<WebAppearanceDimensions> = Object.freeze({
  controlSize: DEFAULT_LUMEN_APPEARANCE.controlSize,
  textSize: DEFAULT_LUMEN_APPEARANCE.textSize,
  cornerSize: DEFAULT_LUMEN_APPEARANCE.cornerSize,
})

export const DEFAULT_WEB_APPEARANCE_PREFERENCES: WebAppearancePreferences = Object.freeze({
  theme: 'system',
  ...DEFAULT_WEB_APPEARANCE_DIMENSIONS,
})

export const WEB_APPEARANCE_PREFERENCE_KEYS = Object.freeze([
  'theme',
  WEB_APPEARANCE_DIMENSION_KEYS.controlSize,
  WEB_APPEARANCE_DIMENSION_KEYS.textSize,
  WEB_APPEARANCE_DIMENSION_KEYS.cornerSize,
] as const)

function readLumenSize(value: unknown, fallback: LumenSize): LumenSize {
  return typeof value === 'string' && (LUMEN_SIZES as readonly string[]).includes(value)
    ? (value as LumenSize)
    : fallback
}

export function resolveWebAppearanceDimensions(values: Readonly<Record<string, unknown>>): WebAppearanceDimensions {
  return {
    controlSize: readLumenSize(
      values[WEB_APPEARANCE_DIMENSION_KEYS.controlSize],
      DEFAULT_WEB_APPEARANCE_DIMENSIONS.controlSize,
    ),
    textSize: readLumenSize(values[WEB_APPEARANCE_DIMENSION_KEYS.textSize], DEFAULT_WEB_APPEARANCE_DIMENSIONS.textSize),
    cornerSize: readLumenSize(
      values[WEB_APPEARANCE_DIMENSION_KEYS.cornerSize],
      DEFAULT_WEB_APPEARANCE_DIMENSIONS.cornerSize,
    ),
  }
}

export function resolveWebAppearancePreferences(values: Readonly<Record<string, unknown>>): WebAppearancePreferences {
  return {
    theme: readThemePreference(values.theme) ?? DEFAULT_WEB_APPEARANCE_PREFERENCES.theme,
    ...resolveWebAppearanceDimensions(values),
  }
}

export function sameWebAppearance(left: WebAppearancePreferences, right: WebAppearancePreferences): boolean {
  return left.theme === right.theme && sameWebAppearanceDimensions(left, right)
}

export function sameWebAppearanceDimensions(left: WebAppearanceDimensions, right: WebAppearanceDimensions): boolean {
  return (
    left.controlSize === right.controlSize && left.textSize === right.textSize && left.cornerSize === right.cornerSize
  )
}

export function createWebLumenAppearance(
  mode: WebResolvedTheme,
  appearance: WebAppearanceDimensions,
  motion: boolean,
): LumenAppearance {
  return {
    mode,
    controlSize: appearance.controlSize,
    textSize: appearance.textSize,
    cornerSize: appearance.cornerSize,
    shape: DEFAULT_LUMEN_APPEARANCE.shape,
    glow: DEFAULT_LUMEN_APPEARANCE.glow,
    motion,
  }
}

export function readAppearanceBootstrap(storage: AppearanceStorage): WebAppearanceDimensions {
  try {
    const raw = storage.getItem(WEB_APPEARANCE_STORAGE_KEY)
    if (!raw) return DEFAULT_WEB_APPEARANCE_DIMENSIONS
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return DEFAULT_WEB_APPEARANCE_DIMENSIONS
    const value = parsed as Readonly<Record<string, unknown>>
    return resolveWebAppearanceDimensions({
      [WEB_APPEARANCE_DIMENSION_KEYS.controlSize]: value.controlSize,
      [WEB_APPEARANCE_DIMENSION_KEYS.textSize]: value.textSize,
      [WEB_APPEARANCE_DIMENSION_KEYS.cornerSize]: value.cornerSize,
    })
  } catch {
    return DEFAULT_WEB_APPEARANCE_DIMENSIONS
  }
}

export function writeAppearanceBootstrap(storage: AppearanceStorage, appearance: WebAppearanceDimensions): boolean {
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
    [WEB_APPEARANCE_DIMENSION_KEYS.controlSize, preferences.controlSize],
    [WEB_APPEARANCE_DIMENSION_KEYS.textSize, preferences.textSize],
    [WEB_APPEARANCE_DIMENSION_KEYS.cornerSize, preferences.cornerSize],
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
    const effective = resolveWebAppearancePreferences(result.values)
    const dimension =
      key === 'theme'
        ? 'theme'
        : key === WEB_APPEARANCE_DIMENSION_KEYS.controlSize
          ? 'controlSize'
          : key === WEB_APPEARANCE_DIMENSION_KEYS.textSize
            ? 'textSize'
            : 'cornerSize'
    if (effective[dimension] === value) continue
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
