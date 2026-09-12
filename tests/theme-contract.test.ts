import { expect, test } from 'bun:test'
import { DEFAULT_THEME_PROFILE, normalizeThemeProfile, themeContributionSchema, themeProfileSchema } from '@hbar/contracts'
import { themeCssVariables } from '../apps/web/src/theme-store'

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
