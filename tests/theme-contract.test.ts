import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import GlassSurface from '../apps/web/src/react-bits/GlassSurface'
import {
  DEFAULT_THEME_PROFILE,
  normalizeThemeProfile,
  themeContributionSchema,
  themeProfileForMode,
  themeProfileSchema,
} from '@hbar/contracts'
import {
  isThemeEventRelevant,
  mergeThemeContributions,
  themeContrastRatio,
  themeCssVariables,
} from '../apps/web/src/react-bits/reference-theme'

test('reference glass consumes independently supplied profiles without a Desktop store', () => {
  const render = (blurAmount: number, cornerRadius: number) =>
    renderToStaticMarkup(
      createElement(GlassSurface, {
        themeProfile: {
          ...DEFAULT_THEME_PROFILE,
          surface: { ...DEFAULT_THEME_PROFILE.surface, blurAmount, cornerRadius },
        },
        role: 'region',
        'aria-label': 'Host supplied reference surface',
      }),
    )
  const first = render(12, 8)
  const second = render(4, 3)
  expect(first).toContain('--glass-blur:12px')
  expect(first).toContain('border-radius:8px')
  expect(second).toContain('--glass-blur:4px')
  expect(second).toContain('border-radius:3px')
  expect(first).toContain('aria-label="Host supplied reference surface"')
  expect(render(12, 8)).toBe(first)
})

test('default theme uses neutral non-purple tokens and validates', () => {
  expect(themeProfileSchema.parse(DEFAULT_THEME_PROFILE)).toEqual(DEFAULT_THEME_PROFILE)
  expect(DEFAULT_THEME_PROFILE.colors.primary).not.toMatch(/8b7dff|b19eef/i)
  expect(DEFAULT_THEME_PROFILE.surface.backgroundOpacity).toBeGreaterThan(0)
})

test('invalid theme profiles fall back to the safe default', () => {
  expect(normalizeThemeProfile({ mode: 'custom' })).toEqual(DEFAULT_THEME_PROFILE)
  expect(() =>
    themeProfileSchema.parse({
      ...DEFAULT_THEME_PROFILE,
      colors: { ...DEFAULT_THEME_PROFILE.colors, primary: 'purple' },
    }),
  ).toThrow()
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
  expect(() =>
    themeContributionSchema.parse({ id: 'unsafe', title: 'Unsafe', tokenOverrides: { cssText: 'body{}' } }),
  ).toThrow()
  expect(() =>
    themeContributionSchema.parse({ id: 'unsafe', title: 'Unsafe', tokenOverrides: { surface: { blurAmount: 999 } } }),
  ).toThrow()
  expect(() =>
    themeContributionSchema.parse({
      id: 'unsafe',
      title: 'Unsafe',
      tokenOverrides: { colors: { primary: 'rgb(1, 2, 3)' } },
    }),
  ).toThrow()
  expect(() =>
    themeContributionSchema.parse({
      id: 'unsafe',
      title: 'Unsafe',
      tokenOverrides: { surface: { backgroundAsset: 'a'.repeat(64) } },
    }),
  ).toThrow()
  expect(() =>
    themeContributionSchema.parse({
      id: 'unsafe',
      title: 'Unsafe',
      tokenOverrides: {},
      backgroundAssets: ['../escape.png'],
    }),
  ).toThrow()
})

test('theme typography rejects executable CSS font expressions', () => {
  expect(() =>
    themeProfileSchema.parse({
      ...DEFAULT_THEME_PROFILE,
      typography: { ...DEFAULT_THEME_PROFILE.typography, bodyFontFamily: 'url(https://example.invalid/font)' },
    }),
  ).toThrow()
})

test('theme background references accept artifacts or managed plugin assets only', () => {
  expect(
    themeProfileSchema.parse({
      ...DEFAULT_THEME_PROFILE,
      surface: { ...DEFAULT_THEME_PROFILE.surface, backgroundAsset: 'plugin/acme.theme/assets/backgrounds/glass.webp' },
    }).surface.backgroundAsset,
  ).toContain('plugin/')
  expect(() =>
    themeProfileSchema.parse({
      ...DEFAULT_THEME_PROFILE,
      surface: { ...DEFAULT_THEME_PROFILE.surface, backgroundAsset: 'https://example.invalid/bg.png' },
    }),
  ).toThrow()
})

test('theme CSS projects a visible primary-colour hover state', () => {
  const variables = themeCssVariables(DEFAULT_THEME_PROFILE)
  expect(variables['--hbar-ac-soft']).toContain('color-mix')
  expect(variables['--hbar-ac-soft-hover']).toContain(DEFAULT_THEME_PROFILE.colors.primary)
  expect(variables['--hbar-ac-border']).toContain(DEFAULT_THEME_PROFILE.colors.primary)
  expect(variables['--hbar-link']).toBe(DEFAULT_THEME_PROFILE.colors.primary)
  expect(variables['--radius-md']).toBe(`${DEFAULT_THEME_PROFILE.surface.cornerRadius}px`)
})

test('default theme maintains readable text and accent contrast', () => {
  expect(
    themeContrastRatio(DEFAULT_THEME_PROFILE.colors.textPrimary, DEFAULT_THEME_PROFILE.colors.background),
  ).toBeGreaterThanOrEqual(4.5)
  expect(
    themeContrastRatio(DEFAULT_THEME_PROFILE.colors.headingText, DEFAULT_THEME_PROFILE.colors.background),
  ).toBeGreaterThanOrEqual(4.5)
  expect(
    themeContrastRatio(DEFAULT_THEME_PROFILE.colors.primary, DEFAULT_THEME_PROFILE.colors.background),
  ).toBeGreaterThanOrEqual(4.5)
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
  expect(mergeThemeContributions(DEFAULT_THEME_PROFILE, [plugin], true).colors.primary).toBe(
    DEFAULT_THEME_PROFILE.colors.primary,
  )
  expect(mergeThemeContributions({ ...DEFAULT_THEME_PROFILE, mode: 'light' }, [plugin], false).mode).toBe('light')
  expect(mergeThemeContributions({ ...DEFAULT_THEME_PROFILE, mode: 'light' }, [plugin], false).colors.primary).toBe(
    '#22aa88',
  )
  const explicit = {
    ...DEFAULT_THEME_PROFILE,
    mode: 'custom' as const,
    colors: { ...DEFAULT_THEME_PROFILE.colors, primary: '#cc8844' },
  }
  expect(mergeThemeContributions(explicit, [plugin]).colors.primary).toBe('#cc8844')
})

test('theme events respect global, project, and session ancestry', () => {
  const session = { scope: 'session' as const, targetId: 'session-a', parentTargetId: 'project-a' }
  const params = (scope: 'global' | 'project' | 'session', targetId?: string) => ({
    scope,
    ...(targetId ? { targetId } : {}),
    revision: 'c'.repeat(64),
    ids: ['appearance.profile'],
  })
  expect(isThemeEventRelevant(params('global'), session)).toBe(true)
  expect(isThemeEventRelevant(params('project', 'project-a'), session)).toBe(true)
  expect(isThemeEventRelevant(params('project', 'project-b'), session)).toBe(false)
  expect(isThemeEventRelevant(params('session', 'session-b'), session)).toBe(false)
})
