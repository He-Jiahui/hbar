import { expect, test } from 'bun:test'
import { DEFAULT_THEME_PROFILE, normalizeThemeProfile, themeContributionSchema, themeProfileForMode, themeProfileSchema } from '@hbar/contracts'
import { isThemeEventRelevant, mergeThemeContributions, themeContrastRatio, themeCssVariables, useThemeSettings } from '../apps/web/src/theme-store'
import { parseThemeContributionForPlugin, rendererSlotDiagnostics, selectRendererSlot, useUIPlugins } from '../apps/web/src/ui-plugins'

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

test('plugin theme contributions can only reference assets owned by that plugin', () => {
  expect(parseThemeContributionForPlugin('acme.theme', {
    id: 'glass',
    title: 'Glass',
    tokenOverrides: { surface: { backgroundAsset: 'plugin/acme.theme/assets/glass.webp' } },
  }).tokenOverrides.surface?.backgroundAsset).toBe('plugin/acme.theme/assets/glass.webp')
  expect(() => parseThemeContributionForPlugin('acme.theme', {
    id: 'glass',
    title: 'Glass',
    tokenOverrides: { surface: { backgroundAsset: 'a'.repeat(64) } },
  })).toThrow(/must reference plugin\/acme\.theme\/assets/)
  expect(() => parseThemeContributionForPlugin('acme.theme', {
    id: 'glass',
    title: 'Glass',
    surfaceEffects: { backgroundAsset: 'plugin/other/assets/glass.webp' },
  })).toThrow(/must reference plugin\/acme\.theme\/assets/)
})

test('theme CSS projects a visible primary-colour hover state', () => {
  const variables = themeCssVariables(DEFAULT_THEME_PROFILE)
  expect(variables['--hbar-ac-soft']).toContain('color-mix')
  expect(variables['--hbar-ac-soft-hover']).toContain(DEFAULT_THEME_PROFILE.colors.primary)
  expect(variables['--hbar-ac-border']).toContain(DEFAULT_THEME_PROFILE.colors.primary)
  expect(variables['--radius-md']).toBe(`${DEFAULT_THEME_PROFILE.surface.cornerRadius}px`)
})

test('default theme maintains readable text and accent contrast', () => {
  expect(themeContrastRatio(DEFAULT_THEME_PROFILE.colors.textPrimary, DEFAULT_THEME_PROFILE.colors.background)).toBeGreaterThanOrEqual(4.5)
  expect(themeContrastRatio(DEFAULT_THEME_PROFILE.colors.headingText, DEFAULT_THEME_PROFILE.colors.background)).toBeGreaterThanOrEqual(4.5)
  expect(themeContrastRatio(DEFAULT_THEME_PROFILE.colors.primary, DEFAULT_THEME_PROFILE.colors.background)).toBeGreaterThanOrEqual(4.5)
})

test('theme mode presets update the complete palette while custom preserves edits', () => {
  const light = themeProfileForMode(DEFAULT_THEME_PROFILE, 'light')
  expect(light.colors.background).toBe('#ffffff')
  expect(light.colors.textPrimary).toBe('#17181c')
  expect(light.typography.bodyTextColor).toBe(light.colors.textPrimary)
  const custom = themeProfileForMode({ ...light, colors: { ...light.colors, primary: '#123456' } }, 'custom')
  expect(custom.colors.primary).toBe('#123456')
})

test('plugin presets apply to the untouched default while explicit user values win', () => {
  const plugin = { id: 'silver-glass', title: 'Silver glass', tokenOverrides: { colors: { primary: '#22aa88' } } }
  expect(mergeThemeContributions(DEFAULT_THEME_PROFILE, [plugin], false).colors.primary).toBe('#22aa88')
  expect(mergeThemeContributions(DEFAULT_THEME_PROFILE, [plugin], true).colors.primary).toBe(DEFAULT_THEME_PROFILE.colors.primary)
  expect(mergeThemeContributions({ ...DEFAULT_THEME_PROFILE, mode: 'light' }, [plugin], false).mode).toBe('light')
  expect(mergeThemeContributions({ ...DEFAULT_THEME_PROFILE, mode: 'light' }, [plugin], false).colors.primary).toBe('#22aa88')
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
  useThemeSettings.setState({ profile: DEFAULT_THEME_PROFILE, profileExplicit: false, savedProfile: DEFAULT_THEME_PROFILE, snapshot: null, draftGeneration: 0 })
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

test('renderer slot diagnostics explain preferred and priority overrides', () => {
  const component = () => null
  useUIPlugins.setState({
    rendererSlots: {
      markdown: [],
      code: [
        { slot: 'code', id: 'acme:fast', owner: 'acme', component, priority: 20, languages: [], supportsStreaming: false, editable: false },
        { slot: 'code', id: 'other:preferred', owner: 'other', component, priority: 1, languages: [], supportsStreaming: false, editable: false },
      ],
      patch: [],
      'git-diff': [],
    },
  })
  const preferred = rendererSlotDiagnostics('code', undefined, 'preferred')
  expect(preferred.find((entry) => entry.active)?.renderer.id).toBe('other:preferred')
  expect(preferred.find((entry) => entry.renderer.id === 'acme:fast')?.reason).toBe('preferred')
  const priority = rendererSlotDiagnostics('code')
  expect(priority.find((entry) => entry.renderer.id === 'other:preferred')?.reason).toBe('priority')
  expect(priority.find((entry) => entry.renderer.id === 'other:preferred')?.overriddenBy).toBe('acme:fast')
})

test('theme events respect global, project, and session ancestry', () => {
  const session = { scope: 'session' as const, targetId: 'session-a', parentTargetId: 'project-a' }
  const params = (scope: 'global' | 'project' | 'session', targetId?: string) => ({ scope, ...(targetId ? { targetId } : {}), revision: 'c'.repeat(64), ids: ['appearance.profile'] })
  expect(isThemeEventRelevant(params('global'), session)).toBe(true)
  expect(isThemeEventRelevant(params('project', 'project-a'), session)).toBe(true)
  expect(isThemeEventRelevant(params('project', 'project-b'), session)).toBe(false)
  expect(isThemeEventRelevant(params('session', 'session-b'), session)).toBe(false)
})
