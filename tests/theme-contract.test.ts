import { expect, test } from 'bun:test'
import { DEFAULT_THEME_PROFILE, normalizeThemeProfile, themeContributionSchema, themeProfileSchema } from '@hbar/contracts'
import { isThemeEventRelevant, mergeThemeContributions, themeContrastRatio, themeCssVariables, useThemeSettings } from '../apps/web/src/theme-store'
import { selectRendererSlot, useUIPlugins } from '../apps/web/src/ui-plugins'

test('default theme uses neutral non-purple tokens and validates', () => {
  expect(themeProfileSchema.parse(DEFAULT_THEME_PROFILE)).toEqual(DEFAULT_THEME_PROFILE)
  expect(DEFAULT_THEME_PROFILE.colors.primary).not.toMatch(/8b7dff|b19eef/i)
  expect(DEFAULT_THEME_PROFILE.surface.backgroundOpacity).toBeGreaterThan(0)
})

test('invalid theme profiles fall back to the safe default', () => {
  expect(normalizeThemeProfile({ mode: 'custom' })).toEqual(DEFAULT_THEME_PROFILE)
  expect(() => themeProfileSchema.parse({ ...DEFAULT_THEME_PROFILE, colors: { ...DEFAULT_THEME_PROFILE.colors, primary: 'purple' } })).toThrow()
})

test('theme plugin contributions are token-only and namespaced by contract', () => {
  const contribution = themeContributionSchema.parse({
    id: 'glass-neutral',
    title: 'Neutral glass',
    priority: 10,
    tokenOverrides: { surface: { blurAmount: 24 } },
    surfaceEffects: { elasticity: 0.2 },
    motion: { intensity: 'subtle' },
    backgroundAssets: ['assets/textures/neutral.png'],
  })
  expect(contribution.tokenOverrides).toEqual({ surface: { blurAmount: 24 } })
  expect(() => themeContributionSchema.parse({ id: 'Bad ID', title: 'Bad', tokenOverrides: {} })).toThrow()
  expect(() => themeContributionSchema.parse({ id: 'unsafe', title: 'Unsafe', tokenOverrides: { cssText: 'body{}' } })).toThrow()
  expect(() => themeContributionSchema.parse({ id: 'unsafe', title: 'Unsafe', tokenOverrides: { surface: { blurAmount: 999 } } })).toThrow()
  expect(() => themeContributionSchema.parse({ id: 'unsafe', title: 'Unsafe', tokenOverrides: { colors: { primary: 'rgb(1, 2, 3)' } } })).toThrow()
  expect(() => themeContributionSchema.parse({ id: 'unsafe', title: 'Unsafe', tokenOverrides: {}, backgroundAssets: ['../escape.png'] })).toThrow()
})

test('theme typography rejects executable CSS font expressions', () => {
  expect(() => themeProfileSchema.parse({ ...DEFAULT_THEME_PROFILE, typography: { ...DEFAULT_THEME_PROFILE.typography, bodyFontFamily: 'url(https://example.invalid/font)' } })).toThrow()
})

test('theme background references accept artifacts or managed plugin assets only', () => {
  expect(themeProfileSchema.parse({ ...DEFAULT_THEME_PROFILE, surface: { ...DEFAULT_THEME_PROFILE.surface, backgroundAsset: 'plugin/acme.theme/assets/backgrounds/glass.webp' } }).surface.backgroundAsset).toContain('plugin/')
  expect(() => themeProfileSchema.parse({ ...DEFAULT_THEME_PROFILE, surface: { ...DEFAULT_THEME_PROFILE.surface, backgroundAsset: 'https://example.invalid/bg.png' } })).toThrow()
})

test('theme CSS projects a visible primary-colour hover state', () => {
  const variables = themeCssVariables(DEFAULT_THEME_PROFILE)
  expect(variables['--hbar-ac-soft']).toContain('color-mix')
  expect(variables['--hbar-ac-soft-hover']).toContain(DEFAULT_THEME_PROFILE.colors.primary)
  expect(variables['--hbar-ac-border']).toContain(DEFAULT_THEME_PROFILE.colors.primary)
})

test('default theme maintains readable text and accent contrast', () => {
  expect(themeContrastRatio(DEFAULT_THEME_PROFILE.colors.textPrimary, DEFAULT_THEME_PROFILE.colors.background)).toBeGreaterThanOrEqual(4.5)
  expect(themeContrastRatio(DEFAULT_THEME_PROFILE.colors.headingText, DEFAULT_THEME_PROFILE.colors.background)).toBeGreaterThanOrEqual(4.5)
  expect(themeContrastRatio(DEFAULT_THEME_PROFILE.colors.primary, DEFAULT_THEME_PROFILE.colors.background)).toBeGreaterThanOrEqual(4.5)
})

test('plugin presets apply to the untouched default while explicit user values win', () => {
  const plugin = { id: 'silver-glass', title: 'Silver glass', tokenOverrides: { colors: { primary: '#22aa88' } } }
  expect(mergeThemeContributions(DEFAULT_THEME_PROFILE, [plugin], false).colors.primary).toBe('#22aa88')
  expect(mergeThemeContributions(DEFAULT_THEME_PROFILE, [plugin], true).colors.primary).toBe(DEFAULT_THEME_PROFILE.colors.primary)
  const explicit = { ...DEFAULT_THEME_PROFILE, mode: 'custom' as const, colors: { ...DEFAULT_THEME_PROFILE.colors, primary: '#cc8844' } }
  expect(mergeThemeContributions(explicit, [plugin]).colors.primary).toBe('#cc8844')
})

test('legacy appearance theme is retained until a full profile is saved', () => {
  const snapshot = {
    schemaVersion: 1 as const,
    revision: 'a'.repeat(64),
    scope: 'global' as const,
    values: {
      'appearance.profile': {
        id: 'appearance.profile',
        effectiveValue: DEFAULT_THEME_PROFILE,
        source: 'default' as const,
        overridden: false,
        editable: true,
        restartPolicy: 'live' as const,
      },
      'appearance.theme': {
        id: 'appearance.theme',
        effectiveValue: 'light',
        source: 'global' as const,
        overridden: true,
        editable: true,
        restartPolicy: 'live' as const,
      },
    },
  }
  useThemeSettings.getState().applySnapshot(snapshot)
  expect(useThemeSettings.getState().profile.mode).toBe('light')
  useThemeSettings.setState({ profile: DEFAULT_THEME_PROFILE, profileExplicit: false, savedProfile: DEFAULT_THEME_PROFILE, snapshot: null })
})

test('discarding a draft restores inherited preset eligibility', () => {
  const snapshot = {
    schemaVersion: 1 as const,
    revision: 'b'.repeat(64),
    scope: 'global' as const,
    values: {
      'appearance.profile': {
        id: 'appearance.profile', effectiveValue: DEFAULT_THEME_PROFILE, source: 'default' as const,
        overridden: false, editable: true, restartPolicy: 'live' as const,
      },
    },
  }
  const store = useThemeSettings.getState()
  store.applySnapshot(snapshot)
  store.updateDraft((current) => ({ ...current, mode: 'custom' }))
  expect(useThemeSettings.getState().profileExplicit).toBe(true)
  store.discardDraft()
  expect(useThemeSettings.getState().profileExplicit).toBe(false)
})

test('renderer slots honour the selected theme renderer before priority fallback', () => {
  const component = () => null
  useUIPlugins.setState((state) => ({
    ...state,
    rendererSlots: {
      ...state.rendererSlots,
      code: [
        { slot: 'code', component, owner: 'acme', id: 'acme:fast-code', priority: 20, languages: ['typescript'], supportsStreaming: false, editable: false },
        { slot: 'code', component, owner: 'other', id: 'other:preferred-code', priority: 1, languages: ['typescript'], supportsStreaming: false, editable: false },
      ],
    },
  }))
  expect(selectRendererSlot('code', 'typescript', 'preferred-code')?.id).toBe('other:preferred-code')
  expect(selectRendererSlot('code', 'typescript', 'missing-code')?.id).toBe('acme:fast-code')
  useUIPlugins.setState((state) => ({ ...state, rendererSlots: { ...state.rendererSlots, code: [] } }))
})

test('theme events respect global, project, and session ancestry', () => {
  const session = { scope: 'session' as const, targetId: 'session-a', parentTargetId: 'project-a' }
  const params = (scope: 'global' | 'project' | 'session', targetId?: string) => ({ scope, ...(targetId ? { targetId } : {}), revision: 'c'.repeat(64), ids: ['appearance.profile'] })
  expect(isThemeEventRelevant(params('global'), session)).toBe(true)
  expect(isThemeEventRelevant(params('project', 'project-a'), session)).toBe(true)
  expect(isThemeEventRelevant(params('project', 'project-b'), session)).toBe(false)
  expect(isThemeEventRelevant(params('session', 'session-b'), session)).toBe(false)
})
